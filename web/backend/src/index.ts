import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import multer from 'multer';
import { User, Door, DoorSession, ChatSession, ChatMessage, ChatState } from './types';
import { db } from './database';
import { config } from './config';
import { qwkManager, ftnManager } from './qwk';
import { nodeManager, arexxEngine, protocolManager } from './nodes';
import { BBSState, LoggedOnSubState } from './constants/bbs-states';
import { extractAndReadDiz, getNodeWorkDir, getPlaypenDir } from './utils/file-diz.util';
import { testFile, TestResult } from './utils/file-test.util';
import { moveUploadedFile, getConferenceDir } from './utils/file-hold.util';
import { writeUploadToDirFile } from './utils/dir-file.util';
import { updateSysopUploadStats, doUploadNotify } from './utils/upload-notify.util';
import { AuthHandler } from './handlers/auth.handler';
import { authenticateToken, AuthRequest } from './middleware/auth.middleware';
import { displayScreen, doPause, parseMciCodes, loadScreenFile, addAnsiEscapes, setConferences } from './handlers/screen.handler';
import { findSecurityScreen } from './utils/screen-security.util';
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
  setDoors,
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
import { setMessagingDependencies } from './handlers/messaging.handler';
import {
  displayAccountEditingMenu,
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

interface BBSSession {
  state: BBSState;
  subState?: LoggedOnSubState;
  user?: any; // Will be User from database
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
  relConfNum: number; // Relative conference number (like AmiExpress relConfNum)
  currentConfName: string; // Current conference name (like AmiExpress currentConfName)
  cmdShortcuts: boolean; // Like AmiExpress cmdShortcuts - controls hotkey vs line input mode
  doorExpertMode: boolean; // Like AmiExpress doorExpertMode - express.e:28583 - door can force menu display
  tempData?: any; // Temporary data storage for complex operations (like file listing)

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
  loginRetryCount: number; // Login retry counter - express.e:29461, 29560 (max 5 before disconnect)

  // Phase 10: Message Pointer System (express.e:199-200, 4882-4973)
  lastMsgReadConf: number; // Last message manually read (confBase.confYM) - express.e:199
  lastNewReadConf: number; // Last message auto-scanned (confBase.confRead) - express.e:200
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
let doors: Door[] = [];
let doorSessions: DoorSession[] = [];

// Chat system state (mirrors AmiExpress chatFlag, sysopAvail, pagedFlag)
let chatState: ChatState = {
  sysopAvailable: true, // Like AmiExpress sysopAvail - F7 toggle
  activeSessions: [],
  pagingUsers: [],
  chatToggle: true // Like AmiExpress F7 chat toggle
};

const app = express();
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
  transports: ['websocket', 'polling'], // Prefer websocket, fallback to polling
  allowEIO3: true, // Support older Socket.io clients
  perMessageDeflate: false, // Disable compression to reduce CPU usage
  httpCompression: false, // Disable HTTP compression to reduce CPU usage
  connectTimeout: 45000, // 45s connection timeout
});

const port = process.env.PORT || config.get('port');

// Store active sessions (in production, use Redis/database)
const sessions = new Map<string, BBSSession>();

// Connection rate limiting - track recent connections
const recentConnections: Map<string, number[]> = new Map();
const MAX_CONNECTIONS_PER_IP = 5; // Max 5 connections per IP
const CONNECTION_WINDOW = 60000; // 60 second window

function checkConnectionLimit(ip: string): boolean {
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

// Initialize handlers
const authHandler = new AuthHandler(db);

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

// Initialize New User Registration handler dependencies - express.e:30003+
const { setNewUserDependencies } = require('./handlers/new-user.handler');

setNewUserDependencies({
  db,
  sessions
});

app.use(cors());
app.use(express.json());

app.get('/', (req: Request, res: Response) => {
  res.json({ message: 'AmiExpress Backend API' });
});

// Authentication endpoints
app.post('/auth/login', (req, res) => authHandler.login(req, res));
app.post('/auth/register', (req, res) => authHandler.register(req, res));
app.post('/auth/refresh', (req, res) => authHandler.refresh(req, res));

// File upload configuration
// Express.e uses Node#/Playpen for uploaded files (express.e:19573-19584)
import * as path from 'path';
import * as fs from 'fs';

const playpenStorage = multer.diskStorage({
  destination: (req, file, cb) => {
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
  filename: (req, file, cb) => {
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
  upload.single('file')(req, res, (err) => {
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
  upload.single('door')(req, res, (err) => {
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

      // Move file to doors/archives directory
      const doorsArchivePath = path.join(__dirname, '../../doors/archives');
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
    const conferencePath = path.join(config.get('dataDir'), 'BBS', `Conf${String(fileEntry.conferenceId || 1).padStart(2, '0')}`);

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
    if (req.user.userId !== userId && req.user.secLevel < 100) {
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

io.on('connection', async (socket) => {
  const clientIp = socket.handshake.address;
  console.log(`Client connected from ${clientIp}`);

  // Check connection rate limit
  if (!checkConnectionLimit(clientIp)) {
    console.warn(`⚠️ Rate limit exceeded for IP: ${clientIp}`);
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

  const session: BBSSession = {
    state: BBSState.AWAIT,
    subState: LoggedOnSubState.DISPLAY_CONNECT, // Start with connection screen
    currentConf: 1, // Start in General conference (ID 1) → BBS/Conf01/
    currentMsgBase: 1, // Start in Main message base (ID 1)
    timeRemaining: 60, // 60 minutes default
    lastActivity: Date.now(),
    confRJoin: 1, // Default to General conference (ID 1)
    msgBaseRJoin: 1, // Default to Main message base (ID 1)
    commandBuffer: '', // Buffer for command input
    menuPause: true, // Like AmiExpress - menu displays immediately by default
    inputBuffer: '', // Buffer for line-based input
    relConfNum: 0, // Relative conference number
    currentConfName: 'General', // Current conference name (matches ID 4)
    cmdShortcuts: false, // Like AmiExpress - default to line input mode, not hotkeys
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
    lastNewReadConf: 0 // Last message auto-scanned
  };
  sessions.set(socket.id, session);

  // Display complete connection screen via AWAITSCREEN.TXT
  // reference-board BBS layout: everything shown via screen file with MCI codes
  // All messages, node list, etc. are in AWAITSCREEN.TXT
  displayScreen(socket, session, 'AWAITSCREEN');

  // Show ANSI prompt immediately (reference-board style - no key wait)
  socket.emit('ansi-output', 'ANSI, RIP or No graphics (A/r/n)? ');

  // Set state to wait for ANSI response
  session.subState = LoggedOnSubState.ANSI_PROMPT;
  session.tempData = { inputBuffer: '' };

  // Execute login trigger for AREXX scripts
  await arexxEngine.executeTrigger('login', {
    userId: undefined,
    sessionId: socket.id,
    environment: { nodeId: nodeSession.nodeId }
  });

  socket.on('login', async (data: { token?: string; username?: string; password?: string }) => {
    try {
      // Enforce connection screen flow - don't allow login until user is in LOGON state
      if (session.state === BBSState.AWAIT) {
        console.log('Login attempt blocked - user must view connection screens first');
        socket.emit('login-failed', 'Please view connection screens first');
        return;
      }

      let user;

      // Check if login is with JWT token or username/password
      if (data.token) {
        console.log('Socket login attempt with JWT token');

        // Verify JWT token
        const decoded = await db.verifyAccessToken(data.token);

        // Get user from database
        user = await db.getUserById(decoded.userId);
        if (!user) {
          socket.emit('login-failed', 'User not found');
          return;
        }
      } else if (data.username && data.password) {
        console.log('Socket login attempt with username/password:', data.username);

        // express.e:29627-29628 - Empty username counts as retry
        if (data.username.trim().length === 0) {
          session.loginRetryCount++;
          console.log(`Login retry count: ${session.loginRetryCount}/5 (empty username)`);

          // express.e:29633-29637 - Check if too many errors
          if (session.loginRetryCount >= 5) {
            console.log('Too many login errors, disconnecting');
            socket.emit('ansi-output', '\r\n\x1b[31mToo Many Errors, Goodbye!\x1b[0m\r\n');
            setTimeout(() => socket.disconnect(), 500);
            return;
          }

          socket.emit('login-failed', 'Username cannot be empty');
          return;
        }

        // express.e:29605-29631 - Check if user exists first, then authenticate
        const existingUser = await db.getUserByUsername(data.username);

        if (!existingUser) {
          // User not found - express.e:29608-29622
          // Prompt: "[R]etry your name or [C]ontinue as a new user?"
          console.log('User not found, prompting for new user creation');
          socket.emit('user-not-found', {
            username: data.username,
            prompt: data.username.toUpperCase() === 'NEW'
              ? '[C]ontinue as a new user? '
              : `\r\nThe name ${data.username} is not used on this BBS.\r\n\r\n[R]etry your name or [C]ontinue as a new user? `
          });
          return;
        }

        // User exists, authenticate with password
        user = await db.authenticateUser(data.username, data.password);
        if (!user) {
          // express.e:29670+ - Invalid password counts as retry
          session.loginRetryCount++;
          console.log(`Login retry count: ${session.loginRetryCount}/5 (invalid password)`);

          // express.e:29633-29637 - Check if too many errors
          if (session.loginRetryCount >= 5) {
            console.log('Too many login errors, disconnecting');
            socket.emit('ansi-output', '\r\n\x1b[31mToo Many Errors, Goodbye!\x1b[0m\r\n');
            setTimeout(() => socket.disconnect(), 500);
            return;
          }

          socket.emit('login-failed', 'Invalid password');
          return;
        }

        // Reset retry counter on successful login
        session.loginRetryCount = 0;

        // Generate JWT tokens for this session
        const accessToken = await db.generateAccessToken(user);
        const refreshToken = await db.generateRefreshToken(user);

        // Send tokens to client for future use
        socket.emit('login-success', {
          user: {
            id: user.id,
            username: user.username,
            realname: user.realname,
            secLevel: user.secLevel,
            expert: user.expert,
            ansi: user.ansi
          },
          token: accessToken,
          refreshToken: refreshToken
        });
      } else {
        socket.emit('login-failed', 'Missing credentials');
        return;
      }

      // Update last login
      await db.updateUser(user.id, { lastLogin: new Date(), calls: user.calls + 1, callsToday: user.callsToday + 1 });

      // Set session user data
      session.state = BBSState.LOGGEDON;
      session.subState = LoggedOnSubState.DISPLAY_BULL;
      session.user = user;

      // Phase 9: Initialize security system (express.e:447-455)
      initializeSecurity(session);

      // Log successful login (express.e:9493 callersLog)
      await callersLog(user.id, user.username, 'Logged on');

      // Trigger webhook for user login
      try {
        const { webhookService, WebhookTrigger } = await import('./services/webhook.service');
        await webhookService.sendWebhook(WebhookTrigger.USER_LOGIN, {
          username: user.username,
          userId: user.id,
          secLevel: user.secLevel,
          calls: user.calls + 1
        });
      } catch (error) {
        console.error('[Webhook] Error sending user login webhook:', error);
      }

      // Set user preferences
      session.confRJoin = user.autoRejoin || 1;
      session.msgBaseRJoin = 1; // Default message base
      // Like express.e:394 - default cmdShortcuts to FALSE (line input mode)
      // This will be set to TRUE if .keys file exists when displaying menu (express.e:6567-6573)
      session.cmdShortcuts = false;

      // If we already sent login-success for username/password, don't send again
      if (data.token) {
        socket.emit('login-success', {
          user: {
            id: user.id,
            username: user.username,
            realname: user.realname,
            secLevel: user.secLevel,
            expert: user.expert,
            ansi: user.ansi
          }
        });
      }

      // Start the proper AmiExpress flow: bulletins first
      displaySystemBulletins(socket, session);
    } catch (error) {
      console.error('Socket login error:', error);
      socket.emit('login-failed', 'Invalid credentials');
    }
  });

  // Check if username exists (called before password prompt)
  socket.on('check-username', async (data: { username: string }) => {
    try {
      console.log('🔍 Checking if username exists:', data.username);

      // Empty username check
      if (data.username.trim().length === 0) {
        session.loginRetryCount++;
        if (session.loginRetryCount >= 5) {
          socket.emit('ansi-output', '\r\n\x1b[31mToo Many Errors, Goodbye!\x1b[0m\r\n');
          setTimeout(() => socket.disconnect(), 500);
          return;
        }
        socket.emit('login-failed', 'Username cannot be empty');
        socket.emit('retry-login');
        return;
      }

      const existingUser = await db.getUserByUsername(data.username);

      if (!existingUser) {
        // User not found - prompt for new user creation
        console.log('User not found, prompting for new user creation');
        socket.emit('user-not-found', {
          username: data.username,
          prompt: data.username.toUpperCase() === 'NEW'
            ? '[C]ontinue as a new user? '
            : `\r\nThe name ${data.username} is not used on this BBS.\r\n\r\n[R]etry your name or [C]ontinue as a new user? `
        });
      } else {
        // User exists - prompt for password
        console.log('User exists, requesting password');
        socket.emit('prompt-password');
      }
    } catch (error) {
      console.error('Username check error:', error);
      socket.emit('login-failed', 'Error checking username');
      socket.emit('retry-login');
    }
  });

  // express.e:29622 - Handle new user response (R=retry, C=continue as new user)
  socket.on('new-user-response', async (data: { response: string; username: string }) => {
    try {
      const response = data.response.toUpperCase().trim();

      if (response === 'C' || response === '') {
        // Continue as new user - express.e:29646-29651
        console.log('User chose to create new account:', data.username);

        // Start new user account creation flow
        session.state = BBSState.REGISTERING;
        session.tempData = { newUsername: data.username };

        // Import and call new user handler
        const { startNewUserRegistration } = require('./handlers/new-user.handler');
        await startNewUserRegistration(socket, session, data.username);
      } else {
        // express.e:29622 - Retry login increments retry counter
        session.loginRetryCount++;
        console.log(`Login retry count: ${session.loginRetryCount}/5 (user chose retry)`);

        // express.e:29633-29637 - Check if too many errors
        if (session.loginRetryCount >= 5) {
          console.log('Too many login errors, disconnecting');
          socket.emit('ansi-output', '\r\n\x1b[31mToo Many Errors, Goodbye!\x1b[0m\r\n');
          setTimeout(() => socket.disconnect(), 500);
          return;
        }

        // Retry login - send back to login screen
        console.log('User chose to retry login');
        socket.emit('retry-login');
      }
    } catch (error) {
      console.error('New user response error:', error);
      socket.emit('login-failed', 'Registration error');
    }
  });

  socket.on('command', (data: string) => {
    console.log('=== COMMAND RECEIVED ===');
    console.log('Raw data:', JSON.stringify(data), 'length:', data.length, 'charCode:', data.charCodeAt ? data.charCodeAt(0) : 'N/A');
    console.log('Session state:', session.state, 'subState:', session.subState);
    console.log('Input buffer:', JSON.stringify(session.inputBuffer));
    console.log('Session ID exists:', sessions.has(socket.id));
    console.log('Session object:', session ? 'EXISTS' : 'NULL');

    // Special debug for Enter key
    if (data === '\r') {
      console.log('🎯 ENTER KEY DETECTED!');
      console.log('🎯 Current subState:', session.subState);
      console.log('🎯 Is POST_MESSAGE_SUBJECT?', session.subState === LoggedOnSubState.POST_MESSAGE_SUBJECT);
      console.log('🎯 Input buffer contents:', JSON.stringify(session.inputBuffer));
    }

    // Handle special chat keys (like F1 in AmiExpress)
    if ((session as any).inChat && data === '\x1b[OP') { // F1 key
      console.log('🎯 F1 pressed during chat - exiting chat');
      exitChat(socket, session);
      return;
    }

    handleCommand(socket, session, data);
    console.log('=== COMMAND PROCESSED ===\n');
  });

  // Handle special chat commands
  socket.on('chat-message', (message: string) => {
    if ((session as any).inChat) {
      sendChatMessage(socket, session, message);
    }
  });

  socket.on('accept-chat', (sessionId: string) => {
    // Sysop accepting chat request
    const chatSession = chatState.activeSessions.find(s => s.id === sessionId);
    if (chatSession && session.user?.secLevel === 255) { // Sysop level
      acceptChat(socket, session, chatSession);
    }
  });

  // Handle file upload completion (express.e:19059-19110)
  socket.on('file-uploaded', async (data: { filename: string; originalname: string; size: number; path?: string }) => {
    console.log('File uploaded event received:', data);

    // Check if Door Manager is active - it has its own file-uploaded handler
    if (session.inDoorManager) {
      console.log('[file-uploaded] Door Manager is active, skipping normal file upload handler');
      return;
    }

    if (!session.tempData?.uploadMode || !session.tempData?.fileArea) {
      socket.emit('ansi-output', '\r\n\x1b[31mError: Upload session invalid\x1b[0m\r\n');
      socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
      session.menuPause = false;
      session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
      session.tempData = undefined;
      return;
    }

    // Web upload mode: check if we need to prompt for description
    if (session.tempData.webUploadMode) {
      // First time file is uploaded - try to extract FILE_ID.DIZ first
      if (!session.tempData.currentUploadedFile) {
        session.tempData.currentUploadedFile = {
          filename: data.originalname,
          path: data.path,
          size: data.size
        };

        socket.emit('ansi-output', `\r\n\x1b[32mFile selected: ${data.originalname}\x1b[0m\r\n`);
        socket.emit('ansi-output', `\x1b[32mSize: ${Math.ceil(data.size / 1024)}KB\x1b[0m\r\n\r\n`);

        console.log('[file-uploaded] File selected, checking for DIZ...');
        console.log('[file-uploaded] dataDir:', config.get('dataDir'));

        // Try to extract FILE_ID.DIZ (express.e:19258-19285)
        if (data.path) {
          try {
            const nodeWorkDir = getNodeWorkDir(0, config.get('dataDir'));
            console.log('[file-uploaded] nodeWorkDir:', nodeWorkDir);

            socket.emit('ansi-output', 'Checking for FILE_ID.DIZ...\r\n');

            // Add 10 second timeout to prevent hanging
            const dizPromise = extractAndReadDiz(data.path, nodeWorkDir, [], 10);
            const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 10000));
            const dizLines = await Promise.race([dizPromise, timeoutPromise]);

            if (dizLines && dizLines.length > 0) {
              // Found FILE_ID.DIZ - use it as description (express.e:19332+)
              socket.emit('ansi-output', '\x1b[36m[FILE_ID.DIZ found - using as description]\x1b[0m\r\n\r\n');

              // Store DIZ as description
              session.tempData.currentDescription = dizLines;
              session.tempData.hasDiz = true;
              session.tempData.skipDizExtraction = true; // Skip second extraction

              // Process upload immediately - no need to prompt
              session.tempData.uploadBatch.push({
                filename: data.originalname,
                description: dizLines.join('\n'),
                isPrivate: false
              });
              session.tempData.currentUploadIndex = 0;

              // Continue processing (fall through to batch processing below)
            } else {
              // No DIZ found - prompt for description (express.e:17720-17731)
              socket.emit('ansi-output', 'No FILE_ID.DIZ found.\r\n\r\n');
              socket.emit('ansi-output', 'Please enter a description (press Enter alone to finish):\r\n');
              // express.e:17731 - filename (13 chars) + 19 spaces + ':'
              socket.emit('ansi-output', `${data.originalname.substring(0, 13).padEnd(13)}                   :`);

              // Initialize description storage
              session.tempData.currentDescription = [];
              session.tempData.maxDescLines = 10;
              session.tempData.descLineCount = 0;

              // Switch to line input mode (disable hotkeys)
              socket.emit('set-input-mode', 'line');
              session.subState = LoggedOnSubState.UPLOAD_DESC_INPUT;
              return;
            }
          } catch (error) {
            console.error('[FILE_ID.DIZ] Extraction error:', error);
            // On error, fall back to prompting for description (express.e:17720-17731)
            socket.emit('ansi-output', 'Please enter a description (press Enter alone to finish):\r\n');
            // express.e:17731 - filename (13 chars) + 19 spaces + ':'
            socket.emit('ansi-output', `${data.originalname.substring(0, 13).padEnd(13)}                   :`);

            session.tempData.currentDescription = [];
            session.tempData.maxDescLines = 10;
            session.tempData.descLineCount = 0;

            // Switch to line input mode (disable hotkeys)
            socket.emit('set-input-mode', 'line');
            session.subState = LoggedOnSubState.UPLOAD_DESC_INPUT;
            return;
          }
        }
      }
      // If currentUploadedFile exists and hasDiz is true, we've collected description - continue to process
    }

    // Original batch upload mode or processing after description
    const fileArea = session.tempData.fileArea;
    const currentIndex = session.tempData.currentUploadIndex || 0;
    const currentFile = session.tempData.uploadBatch[currentIndex];

    if (!currentFile) {
      socket.emit('ansi-output', '\r\n\x1b[31mError: No file info for uploaded file\x1b[0m\r\n');
      socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
      session.menuPause = false;
      session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
      session.tempData = undefined;
      return;
    }

    try {
      // Track upload stats
      if (!session.tempData.uploadedFiles) session.tempData.uploadedFiles = 0;
      if (!session.tempData.uploadedBytes) session.tempData.uploadedBytes = 0;

      session.tempData.uploadedFiles++;
      session.tempData.uploadedBytes += data.size;

      // Extract FILE_ID.DIZ and test file (express.e:19258-19370)
      let finalDescription = currentFile.description;
      let testStatus = TestResult.NOT_TESTED;
      let fileStatus: 'active' | 'private' | 'hold' = currentFile.isPrivate ? 'private' : 'active';

      if (data.path) {
        const nodeWorkDir = getNodeWorkDir(0, config.get('dataDir')); // Node0/WorkDir

        // Extract FILE_ID.DIZ (express.e:19258-19285) - skip if already extracted
        if (!session.tempData.skipDizExtraction) {
          console.log(`[FILE_ID.DIZ] Attempting extraction for ${currentFile.filename}`);
          try {
            // Add 10 second timeout to prevent hanging
            const dizPromise = extractAndReadDiz(data.path, nodeWorkDir, [], 10);
            const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 10000));
            const dizLines = await Promise.race([dizPromise, timeoutPromise]);

            if (dizLines && dizLines.length > 0) {
              finalDescription = dizLines.join('\n');
              console.log(`[FILE_ID.DIZ] Using FILE_ID.DIZ content (${dizLines.length} lines)`);
              socket.emit('ansi-output', `\r\n\x1b[36m[FILE_ID.DIZ found and used for description]\x1b[0m\r\n`);
            } else {
              console.log(`[FILE_ID.DIZ] No FILE_ID.DIZ found or timed out, using batch description`);
            }
          } catch (error) {
            console.error(`[FILE_ID.DIZ] Extraction error:`, error);
          }
        } else {
          console.log(`[FILE_ID.DIZ] Skipping extraction - already done`);
        }

        // Test file integrity (express.e:19348-19354)
        socket.emit('ansi-output', `\r\nTesting... ${currentFile.filename}...\r\n`);
        try {
          // Add 15 second timeout to prevent hanging on file tests
          const testPromise = testFile(data.path, nodeWorkDir);
          const timeoutPromise = new Promise<TestResult>((resolve) =>
            setTimeout(() => resolve(TestResult.NOT_TESTED), 15000)
          );
          testStatus = await Promise.race([testPromise, timeoutPromise]);
          console.log(`[testFile] Result: ${testStatus}`);

          if (testStatus === TestResult.SUCCESS || testStatus === TestResult.NOT_TESTED) {
            socket.emit('ansi-output', '\r\nTested Ok...\r\n');
          } else if (testStatus === TestResult.FAILURE) {
            socket.emit('ansi-output', '\r\n\x1b[33mRequires review, possibly bad format\x1b[0m\r\n');
            socket.emit('ansi-output', `\r\n\x1b[33mMoving to ${config.sysopName}'s private Directory.\x1b[0m\r\n\r\n`);
            fileStatus = 'hold';  // Mark for HOLD directory (express.e:19364-19369)
          }
        } catch (error) {
          console.error(`[testFile] Error:`, error);
          testStatus = TestResult.NOT_TESTED;
          socket.emit('ansi-output', '\r\nTest skipped (error)...\r\n');
        }
      }

      // Determine file checked status marker (express.e:19410-19419)
      let checkedMarker: 'P' | 'F' | 'N' | 'D' = 'N';
      if (testStatus === TestResult.SUCCESS) {
        checkedMarker = 'P';  // Passed
      } else if (testStatus === TestResult.FAILURE) {
        checkedMarker = 'F';  // Failed
      } else {
        checkedMarker = 'N';  // Not tested
      }

      // Move file to appropriate directory (express.e:19403-19415)
      let finalFilePath = data.path || '';
      if (data.path && fileStatus !== 'active') {
        try {
          finalFilePath = await moveUploadedFile(
            data.path,
            currentFile.filename,
            fileStatus,
            session.currentConf,
            config.get('dataDir')
          );
          console.log(`[Upload] File moved to: ${finalFilePath}`);
        } catch (error: any) {
          console.error(`[Upload] Error moving file: ${error.message}`);
          // Continue with original path on error
        }
      }

      // Check for duplicate file in this area (UNIQUE constraint on filename, areaid)
      const existingFile = await db.query(
        'SELECT id, filename FROM file_entries WHERE filename = $1 AND areaid = $2',
        [currentFile.filename, fileArea.id]
      );

      if (existingFile.rows.length > 0) {
        throw new Error(`File "${currentFile.filename}" already exists in this area. Delete the old file first or choose a different filename.`);
      }

      // Save file to database
      const fileEntry = {
        filename: currentFile.filename,
        description: finalDescription,  // Use DIZ if found, otherwise batch description
        size: data.size,
        uploader: session.user!.username,
        uploadDate: new Date(),
        downloads: 0,
        areaId: fileArea.id,
        fileIdDiz: finalDescription,  // Store DIZ text if extracted
        rating: undefined,
        votes: undefined,
        status: fileStatus,  // active, private, or hold based on test result
        checked: checkedMarker,  // P/F/N status marker
        comment: undefined  // Optional sysop comment
      };

      await db.createFileEntry(fileEntry);

      // Write to DIR file (express.e:19473-19509)
      try {
        const conferencePath = getConferenceDir(session.currentConf, config.get('dataDir'));
        await writeUploadToDirFile(
          currentFile.filename,
          data.size,
          new Date(),
          finalDescription,
          checkedMarker,
          session.user!.name || session.user!.username,
          conferencePath,
          fileStatus,
          1,  // maxDirs - TODO: Make configurable
          true  // addSentBy - TODO: Make configurable via SENTBY_FILES
        );
        console.log(`[Upload] Wrote DIR entry for ${currentFile.filename}`);
      } catch (error: any) {
        console.error(`[Upload] Error writing DIR file: ${error.message}`);
        // Don't fail upload on DIR write error
      }

      // Update user stats in users table (for backward compatibility)
      // Use SQL arithmetic to avoid JavaScript number overflow for bytesUpload (BIGINT)
      await db.query(`
        UPDATE users
        SET uploads = uploads + 1,
            bytesupload = bytesupload + $1,
            updated = CURRENT_TIMESTAMP
        WHERE id = $2
      `, [data.size, session.user!.id]);

      // Update user_stats table (for ratio calculations)
      await db.query(
        'UPDATE user_stats SET bytes_uploaded = bytes_uploaded + $1, files_uploaded = files_uploaded + 1 WHERE user_id = $2',
        [data.size, session.user!.id]
      );

      // Log file upload (express.e:9493 callersLog)
      await callersLog(session.user!.id, session.user!.username, 'Uploaded file', currentFile.filename);

      // Trigger webhook for file upload
      try {
        const { webhookService, WebhookTrigger } = await import('./services/webhook.service');
        const conference = await db.getConferenceById(session.currentConf);

        await webhookService.sendWebhook(WebhookTrigger.NEW_UPLOAD, {
          username: session.user!.username,
          filename: currentFile.filename,
          filesize: data.size,
          conference: conference?.name || 'Unknown',
          description: finalDescription.substring(0, 100)
        });
      } catch (error) {
        console.error('[Webhook] Error sending file upload webhook:', error);
      }

      // Update sysop upload statistics (express.e:19440)
      try {
        const conferencePath = getConferenceDir(session.currentConf, config.get('dataDir'));
        await updateSysopUploadStats(
          conferencePath,
          session.currentConf,
          config.get('dataDir'),
          fileStatus === 'hold' || fileStatus === 'private'
        );
      } catch (error: any) {
        console.error(`[Upload] Error updating sysop stats: ${error.message}`);
      }

      // Check if more files to upload
      if (currentIndex + 1 < session.tempData.uploadBatch.length) {
        // More files - trigger next upload
        session.tempData.currentUploadIndex = currentIndex + 1;
        const nextFile = session.tempData.uploadBatch[currentIndex + 1];

        socket.emit('show-file-upload', {
          accept: '*/*',
          maxSize: 10 * 1024 * 1024, // 10MB max
          uploadUrl: '/api/upload',
          fieldName: 'file',
          expectedFilename: nextFile.filename
        });

        session.subState = LoggedOnSubState.FILES_UPLOAD;
        return;
      }

      // All files uploaded - show statistics (express.e:19059-19083)
      const uploadTime = Math.floor((Date.now() - session.tempData.uploadStartTime) / 1000); // seconds
      const minutes = Math.floor(uploadTime / 60);
      const seconds = uploadTime % 60;
      const bytesKB = Math.floor(session.tempData.uploadedBytes / 1024);
      const cps = uploadTime > 0 ? Math.floor(session.tempData.uploadedBytes / uploadTime) : 0;

      socket.emit('ansi-output', '\r\n\r\nFile Uploading Complete...\r\n');
      socket.emit('ansi-output', ` ${session.tempData.uploadedFiles} file(s), ${bytesKB}k bytes, ${minutes} minute(s). ${seconds} second(s), ${cps} cps.\r\n`);
      socket.emit('ansi-output', '\r\n');

      // Log batch upload summary
      const summaryLog = `\t ${session.tempData.uploadedFiles} file(s), ${bytesKB}k bytes, ${minutes} minute(s). ${seconds} second(s), ${cps} cps.`;
      await callersLog(session.user!.id, session.user!.username, summaryLog);

      // Notify sysop of upload (express.e:19098)
      try {
        await doUploadNotify(
          session.user!.name || session.user!.username,
          session.user!.location || 'Unknown',
          config.bbsName || 'AmiExpress BBS',
          undefined,  // TODO: Get sysop email from config
          false  // TODO: Get MAIL_ON_UPLOAD from config
        );
      } catch (error: any) {
        console.error(`[Upload] Error sending upload notification: ${error.message}`);
      }

      socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
      session.menuPause = false;
      session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
      session.tempData = undefined;

    } catch (error: any) {
      console.error('File upload error:', error);

      // Show specific error message to user
      const errorMessage = error.message || 'Unknown database error';
      socket.emit('ansi-output', `\r\n\x1b[31mUpload failed: ${errorMessage}\x1b[0m\r\n`);
      socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
      session.menuPause = false;
      session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
      session.tempData = undefined;
    }
  });

  // Handle file download started - express.e:9475+ (logUDFile for downloads)
  socket.on('file-download-started', async (data: { filename: string; fileId?: number }) => {
    console.log('[Download] File download started:', data.filename);

    if (!session.user) {
      console.error('[Download] No user session for download');
      return;
    }

    try {
      // Get file info from database
      let fileEntry;
      if (data.fileId) {
        fileEntry = await db.getFileEntry(data.fileId);
      } else {
        // Find by filename in current conference
        const conferenceId = session.currentConf || 1;
        const result = await db.query(
          `SELECT fe.* FROM file_entries fe
           JOIN file_areas fa ON fe.areaid = fa.id
           WHERE fa.conferenceid = $1 AND fe.filename = $2
           LIMIT 1`,
          [conferenceId, data.filename]
        );
        fileEntry = result.rows[0];
      }

      if (!fileEntry) {
        console.error('[Download] File not found in database:', data.filename);
        return;
      }

      // Update file download count
      await db.updateFileEntry(fileEntry.id, {
        downloads: (fileEntry.downloads || 0) + 1
      });

      // Update user download statistics (express.e:9475-9492)
      // Use SQL arithmetic to avoid JavaScript number overflow for bytesDownload (BIGINT)
      await db.query(`
        UPDATE users
        SET downloads = downloads + 1,
            bytesdownload = bytesdownload + $1,
            updated = CURRENT_TIMESTAMP
        WHERE id = $2
      `, [fileEntry.size, session.user.id]);

      // Update user_stats table (for ratio calculations)
      await db.query(
        'UPDATE user_stats SET bytes_downloaded = bytes_downloaded + $1, files_downloaded = files_downloaded + 1 WHERE user_id = $2',
        [fileEntry.size, session.user.id]
      );

      // Log file download (express.e:9493 callersLog)
      await callersLog(session.user.id, session.user.username, 'Downloaded file', fileEntry.filename);

      // Trigger webhook for file download
      try {
        const { webhookService, WebhookTrigger } = await import('./services/webhook.service');
        const conference = await db.getConferenceById(session.currentConf);

        await webhookService.sendWebhook(WebhookTrigger.FILE_DOWNLOADED, {
          username: session.user.username,
          filename: fileEntry.filename,
          filesize: fileEntry.size,
          conference: conference?.name || 'Unknown'
        });
      } catch (error) {
        console.error('[Webhook] Error sending file download webhook:', error);
      }

      console.log(`[Download] Updated stats for ${session.user.username} - ${fileEntry.filename} (${fileEntry.size} bytes)`);

    } catch (error) {
      console.error('[Download] Error updating statistics:', error);
    }
  });

  // ===== INTERNODE CHAT EVENTS =====
  // Real-time user-to-user chat Socket.io handlers

  socket.on('chat:request', async (data: { targetUsername: string }) => {
    const session = sessions.get(socket.id);
    if (!session) return;

    const { handleChatRequest } = require('./handlers/internode-chat.handler');
    await handleChatRequest(socket, session, data);
  });

  socket.on('chat:accept', async (data: { sessionId: string }) => {
    const session = sessions.get(socket.id);
    if (!session) return;

    const { handleChatAccept } = require('./handlers/internode-chat.handler');
    await handleChatAccept(socket, session, data);
  });

  socket.on('chat:decline', async (data: { sessionId: string }) => {
    const session = sessions.get(socket.id);
    if (!session) return;

    const { handleChatDecline } = require('./handlers/internode-chat.handler');
    await handleChatDecline(socket, session, data);
  });

  socket.on('chat:message', async (data: { message: string }) => {
    console.log('📨 [SOCKET.IO] Received chat:message event from client');
    console.log('📨 [SOCKET.IO] Data:', data);
    console.log('📨 [SOCKET.IO] Socket ID:', socket.id);
    const session = sessions.get(socket.id);
    if (!session) {
      console.log('❌ [SOCKET.IO] No session found for socket:', socket.id);
      return;
    }
    console.log('📨 [SOCKET.IO] Session found, user:', session.user?.username);

    const { handleChatMessage } = require('./handlers/internode-chat.handler');
    await handleChatMessage(socket, session, data);
    console.log('📨 [SOCKET.IO] handleChatMessage completed');
  });

  socket.on('chat:end', async () => {
    const session = sessions.get(socket.id);
    if (!session) return;

    const { handleChatEnd } = require('./handlers/internode-chat.handler');
    await handleChatEnd(socket, session);
  });

  // ===== GROUP CHAT ROOM EVENTS =====
  // Real-time multi-user chat room Socket.io handlers

  socket.on('room:create', async (data: { roomName: string; topic?: string; isPublic?: boolean; password?: string; maxUsers?: number }) => {
    const session = sessions.get(socket.id);
    if (!session) return;

    const { handleRoomCreate } = require('./handlers/group-chat.handler');
    await handleRoomCreate(socket, session, data);
  });

  socket.on('room:join', async (data: { roomId?: string; roomName?: string; password?: string }) => {
    const session = sessions.get(socket.id);
    if (!session) return;

    const { handleRoomJoin } = require('./handlers/group-chat.handler');
    await handleRoomJoin(socket, session, data);
  });

  socket.on('room:leave', async () => {
    const session = sessions.get(socket.id);
    if (!session) return;

    const { handleRoomLeave } = require('./handlers/group-chat.handler');
    await handleRoomLeave(socket, session);
  });

  socket.on('room:message', async (data: { message: string }) => {
    const session = sessions.get(socket.id);
    if (!session) return;

    const { handleRoomMessage } = require('./handlers/group-chat.handler');
    await handleRoomMessage(socket, session, data);
  });

  socket.on('room:list', async (data?: { showPrivate?: boolean }) => {
    const session = sessions.get(socket.id);
    if (!session) return;

    const { handleRoomList } = require('./handlers/group-chat.handler');
    await handleRoomList(socket, session, data);
  });

  socket.on('room:kick', async (data: { targetUsername: string }) => {
    const session = sessions.get(socket.id);
    if (!session) return;

    const { handleRoomKick } = require('./handlers/group-chat.handler');
    await handleRoomKick(socket, session, data);
  });

  socket.on('room:mute', async (data: { targetUsername: string; mute: boolean }) => {
    const session = sessions.get(socket.id);
    if (!session) return;

    const { handleRoomMute } = require('./handlers/group-chat.handler');
    await handleRoomMute(socket, session, data);
  });

  // Font preference handlers
  socket.on('get-font-preference', async () => {
    const session = sessions.get(socket.id);
    if (!session || !session.user) {
      socket.emit('font-preference', { font: 'mosoul' }); // Default
      return;
    }

    const fontPreference = (session.user as any).fontPreference || 'mosoul';
    socket.emit('font-preference', { font: fontPreference });
  });

  socket.on('set-font-preference', async (data: { font: string }) => {
    const session = sessions.get(socket.id);
    if (!session || !session.user) return;

    try {
      await db.updateUser(session.user.id, { fontPreference: data.font });
      (session.user as any).fontPreference = data.font;
      socket.emit('font-changed', { font: data.font });
    } catch (error) {
      console.error('Error updating font preference:', error);
    }
  });

  socket.on('disconnect', async () => {
    console.log('Client disconnected');

    const session = sessions.get(socket.id);

    // Handle internode chat cleanup if user was in chat
    if (session && session.subState === LoggedOnSubState.CHAT) {
      const { handleChatDisconnect } = require('./handlers/internode-chat.handler');
      await handleChatDisconnect(socket, session);
    }

    // Handle group chat room cleanup if user was in a room
    if (session && session.subState === LoggedOnSubState.CHAT_ROOM) {
      const { handleRoomDisconnect } = require('./handlers/group-chat.handler');
      await handleRoomDisconnect(socket, session);
    }

    // Log user logout if they were logged in (express.e:9493 callersLog)
    if (session?.user) {
      await callersLog(session.user.id, session.user.username, 'Logged off');
    }

    // Release node back to available pool
    await nodeManager.releaseSession(socket.id);

    // Clean up session
    sessions.delete(socket.id);
  });
});

// Display system bulletins (SCREEN_BULL equivalent)
function displaySystemBulletins(socket: any, session: BBSSession) {
  // In AmiExpress, displayScreen(SCREEN_BULL) shows system bulletins
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

  // Move to next state after bulletin display
  // express.e:28555-28648 flow: BULL → NODE_BULL → confScan → CONF_BULL → MENU
  session.subState = LoggedOnSubState.CONF_SCAN;
}

// ===== SCREEN FILE SYSTEM (Phase 8) =====
// AmiExpress screen file system for authentic BBS display
// express.e uses displayScreen() throughout - lines 28566, 28571, 28586, etc.

// Screen name constants (like express.e SCREEN_* constants)
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

// Parse MCI codes (Macro Command Interface) in screen files
// Like express.e parseMci() function
// ===== SCREEN HANDLING NOW IN handlers/screen.handler.ts =====

// Log caller activity (express.e:9493 callersLog)
// Logs to database like express.e logs to BBS:Node{X}/CallersLog file
async function callersLog(userId: string | null, username: string, action: string, details?: string, nodeId: number = 1) {
  try {
    await db.pool.query(
      'INSERT INTO caller_activity (node_id, user_id, username, action, details) VALUES ($1, $2, $3, $4, $5)',
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
    return (result.rowCount || 0) > 0;
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
    return (result.rowCount || 0) > 0;
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
    return (result.rowCount || 0) > 0;
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
    return result.rowCount || 0;
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
    return result.rowCount || 0;
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
  const client = await db.pool.connect();
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
      'SELECT conf_num, file_name FROM flagged_files WHERE user_id = $1',
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
      'SELECT history_num, history_cycle, commands FROM command_history WHERE user_id = $1',
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
      enabled: true,
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

    conferences = await db.getConferences();
    if (conferences.length === 0) {
      await db.initializeDefaultData();
      conferences = await db.getConferences();
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
    setConstants({ SCREEN_BULL, SCREEN_NODE_BULL, LoggedOnSubState });

    // Load file areas for all conferences
    fileAreas = [];
    for (const conf of conferences) {
      const areas = await db.getFileAreas(conf.id);
      fileAreas.push(...areas);
    }

    // Load file entries for all file areas
    fileEntries = await db.getFileEntries();

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

    // Initialize doors
    await initializeDoors();

    // Inject dependencies into door handler
    setDoors(doors);
    setDoorSessions(doorSessions);
    setDatabaseForDoorHandler(db);
    setHelpersForDoorHandler({ callersLog, getRecentCallerActivity });
    setConstantsForDoorHandler({ LoggedOnSubState });

    // Load Amiga command definitions (.info and .CMD files)
    // express.e loads commands at startup for SYSCMD and BBSCMD lookup
    const bbsBaseDir = path.join(__dirname, '../BBS');
    loadCommands(bbsBaseDir, 1, 0); // Load for conference 1, node 0

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
      displayScreen,
      displayUploadInterface,
      displayDownloadInterface
    });

    // Inject dependencies into system commands handler
    setSystemCommandsDependencies({
      displayScreen,
      findSecurityScreen
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
      confScreenDir: path.join(config.get('dataDir') || path.join(__dirname, '..'), 'BBS', 'Conf01', 'Screens'),
      db
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
      displayScreen,
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
      confScreenDir: path.join(config.get('dataDir') || path.join(__dirname, '..'), 'BBS', 'Conf01', 'Screens'),
      findSecurityScreen,
      displayScreen,
      searchFileDescriptions
    });

    // Inject dependencies into sysop commands handler
    setSysopCommandsDependencies({
      getRecentCallerActivity,
      setEnvStat,
      displayAccountEditingMenu
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
    setDoorsForCommandHandler(doors);
    setConstantsForCommandHandler({ SCREEN_MENU });

    // Inject dependencies into command execution handler
    setCommandExecutionDependencies(executeDoor, processBBSCommand);

    console.log('Database initialized with:', {
      conferences: conferences.length,
      messageBases: messageBases.length,
      fileAreas: fileAreas.length,
      messages: messages.length,
      doors: doors.length
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
    console.log('✅ Database initialization complete');

    // Now start accepting connections
    server.listen(port, () => {
      console.log(`✅ Server running on port ${port}`);
      console.log(`🌐 BBS accessible at http://localhost:${port}/`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
})();
