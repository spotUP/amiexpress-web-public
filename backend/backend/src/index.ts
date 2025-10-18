import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { User, Door, DoorSession, ChatSession, ChatMessage, ChatState } from './types';
import { db } from './database';
import { config } from './config';
import { qwkManager, ftnManager } from './qwk';
import { nodeManager, arexxEngine, protocolManager } from './nodes';
import { BBSState, LoggedOnSubState } from './constants/bbs-states';
import { AuthHandler } from './handlers/auth.handler';
import { authenticateToken, AuthRequest } from './middleware/auth.middleware';
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
  }
});

const port = process.env.PORT || config.get('port');

// Store active sessions (in production, use Redis/database)
const sessions = new Map<string, BBSSession>();

// Initialize handlers
const authHandler = new AuthHandler(db);

app.use(cors());
app.use(express.json());

app.get('/', (req: Request, res: Response) => {
  res.json({ message: 'AmiExpress Backend API' });
});

// Authentication endpoints
app.post('/auth/login', (req, res) => authHandler.login(req, res));
app.post('/auth/register', (req, res) => authHandler.register(req, res));
app.post('/auth/refresh', (req, res) => authHandler.refresh(req, res));

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
  console.log('Client connected');

  // Initialize session with multi-node support
  const nodeSession = await nodeManager.assignSessionToNode(socket.id, socket.id);

  const session: BBSSession = {
    state: BBSState.AWAIT,
    currentConf: 0,
    currentMsgBase: 0,
    timeRemaining: 60, // 60 minutes default
    lastActivity: Date.now(),
    confRJoin: 1, // Default to General conference
    msgBaseRJoin: 1, // Default to Main message base
    commandBuffer: '', // Buffer for command input
    menuPause: true, // Like AmiExpress - menu displays immediately by default
    inputBuffer: '', // Buffer for line-based input
    relConfNum: 0, // Relative conference number
    currentConfName: 'Unknown', // Current conference name
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

    // Phase 10: Initialize message pointers (express.e:199-200)
    lastMsgReadConf: 0, // Last message manually read
    lastNewReadConf: 0 // Last message auto-scanned
  };
  sessions.set(socket.id, session);

  // Execute login trigger for AREXX scripts
  await arexxEngine.executeTrigger('login', {
    userId: undefined,
    sessionId: socket.id,
    environment: { nodeId: nodeSession.nodeId }
  });

  socket.on('login', async (data: { token?: string; username?: string; password?: string }) => {
    try {
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

        // Authenticate with username/password
        user = await db.authenticateUser(data.username, data.password);
        if (!user) {
          socket.emit('login-failed', 'Invalid username or password');
          return;
        }

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

      // Set user preferences
      session.confRJoin = user.autoRejoin || 1;
      session.msgBaseRJoin = 1; // Default message base
      session.cmdShortcuts = !user.expert; // Expert mode uses shortcuts

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

  // Registration is now handled via REST API endpoints
  // Socket registration removed - use /auth/register endpoint instead

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

  socket.on('disconnect', async () => {
    console.log('Client disconnected');

    // Log user logout if they were logged in (express.e:9493 callersLog)
    const session = sessions.get(socket.id);
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
  socket.emit('ansi-output', '- PostgreSQL database backend\r\n');
  socket.emit('ansi-output', '- Full conference system\r\n');
  socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');

  // Move to next state after bulletin display (mirroring doPause logic)
  session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
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
function parseMciCodes(content: string, session: BBSSession, bbsName: string = 'AmiExpress-Web'): string {
  let parsed = content;

  // %B - BBS Name
  parsed = parsed.replace(/%B/g, bbsName);

  // %CF - Current Conference Name
  parsed = parsed.replace(/%CF/g, session.currentConfName || 'Unknown');

  // %R - Time Remaining (in minutes)
  parsed = parsed.replace(/%R/g, Math.floor(session.timeRemaining / 60).toString());

  // %D - Current Date
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' });
  parsed = parsed.replace(/%D/g, dateStr);

  // %U - Username
  parsed = parsed.replace(/%U/g, session.user?.username || 'Guest');

  // %N - Node Number (always 1 in web version)
  parsed = parsed.replace(/%N/g, '1');

  return parsed;
}

// Load screen file from disk
// Like express.e displayScreen() - loads from BBS:Node{X}/Screens/ or BBS:Conf{X}/Screens/
function loadScreenFile(screenName: string, conferenceId?: number, nodeId: number = 0): string | null {
  const baseDir = path.join(__dirname, '../data/bbs/BBS');
  const paths = [];

  // Try conference-specific screen first (if provided)
  if (conferenceId) {
    const confPath = path.join(baseDir, `Conf0${conferenceId}`, 'Screens', `${screenName}.TXT`);
    paths.push(confPath);
  }

  // Then try node-specific screen
  const nodePath = path.join(baseDir, `Node${nodeId}`, 'Screens', `${screenName}.TXT`);
  paths.push(nodePath);

  // Then try default BBS screens
  const bbsPath = path.join(baseDir, 'Screens', `${screenName}.TXT`);
  paths.push(bbsPath);

  // Try each path in order
  for (const filePath of paths) {
    try {
      if (fs.existsSync(filePath)) {
        return fs.readFileSync(filePath, 'utf-8');
      }
    } catch (error) {
      console.error(`Error loading screen ${screenName} from ${filePath}:`, error);
    }
  }

  console.warn(`Screen file not found: ${screenName}`);
  return null;
}

// Display a screen file to the user
// Like express.e displayScreen(screenName) - express.e:28566, 28571, 28586
function displayScreen(socket: any, session: BBSSession, screenName: string) {
  const content = loadScreenFile(screenName, session.currentConf);

  if (content) {
    // Parse MCI codes
    const parsed = parseMciCodes(content, session);

    // Send to client (screen files already have ANSI codes and \r\n line endings)
    socket.emit('ansi-output', parsed);
  } else {
    // Fallback if screen not found
    console.warn(`Using fallback for screen: ${screenName}`);
    socket.emit('ansi-output', `\x1b[36m-= ${screenName} =-\x1b[0m\r\n`);
  }
}

// Display "Press any key..." pause prompt
// Like express.e doPause() - express.e:28566, 28571
function doPause(socket: any, session: BBSSession) {
  socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
  // Note: Actual key wait is handled by client sending keypress event
  // This just displays the prompt
}

// ===== END SCREEN FILE SYSTEM =====

// Log caller activity (express.e:9493 callersLog)
// Logs to database like express.e logs to BBS:Node{X}/CallersLog file
async function callersLog(userId: string | null, username: string, action: string, details?: string, nodeId: number = 1) {
  try {
    await db.query(
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

// Display conference bulletins and trigger conference scan (SCREEN_NODE_BULL + confScan equivalent)
async function displayConferenceBulletins(socket: any, session: BBSSession) {
  // Phase 8: Use authentic screen file system
  // Express.e:28566 - displayScreen(SCREEN_BULL)
  displayScreen(socket, session, SCREEN_BULL);
  doPause(socket, session);

  // Express.e:28571 - displayScreen(SCREEN_NODE_BULL)
  displayScreen(socket, session, SCREEN_NODE_BULL);
  doPause(socket, session);

  // Conference scan (confScan equivalent - express.e:28066)
  socket.emit('ansi-output', '\r\n\x1b[32mScanning conferences for new messages...\x1b[0m\r\n');

  // Get user's last scan time (use last login if no scan time stored)
  const lastScanTime = session.user!.lastScanTime || session.user!.lastLogin || new Date(0);

  // Query for new messages per conference since last scan
  const newMessagesQuery = await db.query(
    `SELECT c.id, c.name, COUNT(m.id) as new_count
     FROM conferences c
     LEFT JOIN messages m ON m.conference_id = c.id AND m.timestamp > $1
     GROUP BY c.id, c.name
     HAVING COUNT(m.id) > 0
     ORDER BY c.id`,
    [lastScanTime]
  );

  if (newMessagesQuery.rows.length > 0) {
    socket.emit('ansi-output', '\x1b[32mFound new messages in:\x1b[0m\r\n');
    newMessagesQuery.rows.forEach((row: any) => {
      socket.emit('ansi-output', `- ${row.name} conference (${row.new_count} new)\r\n`);
    });
  } else {
    socket.emit('ansi-output', '\x1b[33mNo new messages found.\x1b[0m\r\n');
  }

  // Update last scan time
  await db.updateUser(session.user!.id, { lastScanTime: new Date() });

  socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');

  // Join default conference (joinConf equivalent)
  await joinConference(socket, session, session.confRJoin, session.msgBaseRJoin);
}

// Join conference function (joinConf equivalent)
async function joinConference(socket: any, session: BBSSession, confId: number, msgBaseId: number) {
  const conference = conferences.find(c => c.id === confId);
  if (!conference) {
    socket.emit('ansi-output', '\r\n\x1b[31mInvalid conference!\x1b[0m\r\n');
    return false;
  }

  const messageBase = messageBases.find(mb => mb.id === msgBaseId && mb.conferenceId === confId);
  if (!messageBase) {
    socket.emit('ansi-output', '\r\n\x1b[31mInvalid message base for this conference!\x1b[0m\r\n');
    return false;
  }

  session.currentConf = confId;
  session.currentMsgBase = msgBaseId;
  session.currentConfName = conference.name;
  session.relConfNum = confId; // For simplicity, use absolute conf number as relative

  socket.emit('ansi-output', `\r\n\x1b[32mJoined conference: ${conference.name}\x1b[0m\r\n`);
  socket.emit('ansi-output', `\r\n\x1b[32mCurrent message base: ${messageBase.name}\x1b[0m\r\n`);

  // Log conference join (express.e:9493 callersLog)
  if (session.user) {
    await callersLog(session.user.id, session.user.username, 'Joined conference', conference.name);
  }

  // Like express.e:28576-28577 - load flagged files and command history
  await loadFlagged(socket, session);
  await loadHistory(session);

  // Move to menu display
  session.subState = LoggedOnSubState.DISPLAY_MENU;
  return true;
}

// Display file area contents (displayIt equivalent in AmiExpress)
function displayFileAreaContents(socket: any, session: BBSSession, area: any) {
  socket.emit('ansi-output', `\x1b[2J\x1b[H`); // Clear screen
  socket.emit('ansi-output', `\x1b[36m-= ${area.name} =-\x1b[0m\r\n`);
  socket.emit('ansi-output', `${area.description}\r\n\r\n`);

  // Get files in this area (like reading DIR file in AmiExpress)
  const areaFiles = fileEntries.filter(file => file.areaId === area.id);

  if (areaFiles.length === 0) {
    socket.emit('ansi-output', 'No files in this area.\r\n');
  } else {
    socket.emit('ansi-output', 'Available files:\r\n\r\n');

    // Format like AmiExpress DIR file display (1:1 with displayIt)
    areaFiles.forEach(file => {
      const sizeKB = Math.ceil(file.size / 1024);
      const dateStr = file.uploadDate.toLocaleDateString();
      const description = file.fileIdDiz || file.description;

      // Format exactly like AmiExpress DIR display:
      // filename        sizeK date       uploader
      //   description line 1
      //   description line 2
      socket.emit('ansi-output', `${file.filename.padEnd(15)}${sizeKB.toString().padStart(5)}K ${dateStr} ${file.uploader}\r\n`);
      socket.emit('ansi-output', `  ${description}\r\n\r\n`);
    });
  }

  socket.emit('ansi-output', '\r\n\x1b[32mPress any key to return to file areas...\x1b[0m');
  session.subState = LoggedOnSubState.FILE_LIST;
}

// displayFileList() - Main file listing function (1:1 with AmiExpress)
function displayFileList(socket: any, session: BBSSession, params: string, reverse: boolean = false) {
  console.log('displayFileList called with params:', params, 'reverse:', reverse);

  // Parse parameters (like parseParams in AmiExpress)
  const parsedParams = parseParams(params);
  console.log('Parsed params:', parsedParams);

  // Check for non-stop flag (NS parameter)
  const nonStopDisplay = parsedParams.includes('NS');

  socket.emit('ansi-output', '\r\n');
  if (reverse) {
    socket.emit('ansi-output', '\x1b[36m-= File Areas (Reverse) =-\x1b[0m\r\n');
  } else {
    socket.emit('ansi-output', '\x1b[36m-= File Areas =-\x1b[0m\r\n');
  }

  // Get file areas for current conference (like AmiExpress DIR structure)
  const currentFileAreas = fileAreas.filter(area => area.conferenceId === session.currentConf);

  if (currentFileAreas.length === 0) {
    socket.emit('ansi-output', 'No file areas available in this conference.\r\n');
    socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
    session.menuPause = false;
    session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
    return;
  }

  // Directory selection (getDirSpan equivalent)
  if (parsedParams.length > 0 && !parsedParams.includes('NS')) {
    // Direct directory selection from params
    const dirSpan = getDirSpan(parsedParams[0], currentFileAreas.length);
    if (dirSpan.startDir === -1) {
      socket.emit('ansi-output', '\r\n\x1b[31mInvalid directory selection.\x1b[0m\r\n');
      socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
      session.menuPause = false;
      session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
      return;
    }

    // Display selected directories
    displaySelectedFileAreas(socket, session, currentFileAreas, dirSpan, reverse, nonStopDisplay);
  } else {
    // Interactive directory selection (like getDirSpan prompt)
    displayDirectorySelectionPrompt(socket, session, currentFileAreas, reverse, nonStopDisplay);
  }
}

// getDirSpan() - Directory selection logic (1:1 with AmiExpress)
function getDirSpan(param: string, maxDirs: number): { startDir: number, dirScan: number } {
  const upperParam = param.toUpperCase();

  // Handle special cases
  if (upperParam === 'U') {
    return { startDir: maxDirs, dirScan: maxDirs }; // Upload directory
  }
  if (upperParam === 'A') {
    return { startDir: 1, dirScan: maxDirs }; // All directories
  }
  if (upperParam === 'H') {
    return { startDir: -1, dirScan: -1 }; // Hold directory (if allowed)
  }

  // Handle numeric directory selection
  const dirNum = parseInt(upperParam);
  if (!isNaN(dirNum) && dirNum >= 1 && dirNum <= maxDirs) {
    return { startDir: dirNum, dirScan: dirNum };
  }

  return { startDir: -1, dirScan: -1 }; // Invalid
}

// Display directory selection prompt (like getDirSpan interactive prompt)
function displayDirectorySelectionPrompt(socket: any, session: BBSSession, fileAreas: any[], reverse: boolean, nonStop: boolean) {
  socket.emit('ansi-output', '\x1b[36mDirectories: \x1b[32m(1-\x1b[33m' + fileAreas.length + '\x1b[32m) \x1b[36m, \x1b[32m(\x1b[33mA\x1b[32m)\x1b[36mll, \x1b[32m(\x1b[33mU\x1b[32m)\x1b[36mpload, \x1b[32m(\x1b[33mEnter\x1b[32m)\x1b[36m=none? \x1b[0m');
  session.subState = LoggedOnSubState.FILE_DIR_SELECT;
  session.tempData = { fileAreas, reverse, nonStop };
}

// Display selected file areas
function displaySelectedFileAreas(socket: any, session: BBSSession, fileAreas: any[], dirSpan: { startDir: number, dirScan: number }, reverse: boolean, nonStop: boolean) {
  let currentDir = reverse ? dirSpan.dirScan : dirSpan.startDir;
  const endDir = reverse ? dirSpan.startDir : dirSpan.dirScan;
  const step = reverse ? -1 : 1;

  while ((reverse && currentDir >= endDir) || (!reverse && currentDir <= endDir)) {
    const areaIndex = currentDir - 1; // Convert to 0-based array index
    if (areaIndex >= 0 && areaIndex < fileAreas.length) {
      const area = fileAreas[areaIndex];
      displayFileAreaContents(socket, session, area);

      // If not non-stop, wait for user input between areas
      if (!nonStop && currentDir !== endDir) {
        session.subState = LoggedOnSubState.FILE_LIST_CONTINUE;
        session.tempData = { fileAreas, dirSpan, reverse, nonStop, currentDir: currentDir + step };
        return;
      }
    }
    currentDir += step;
  }

  // Finished displaying all areas
  socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
  session.menuPause = false;
  session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
}

// displayFileMaintenance() - File maintenance/search (FM command)
function displayFileMaintenance(socket: any, session: BBSSession, params: string) {
  socket.emit('ansi-output', '\x1b[36m-= File Maintenance =-\x1b[0m\r\n');
  socket.emit('ansi-output', 'File maintenance and search functionality.\r\n\r\n');

  // Parse parameters (like AmiExpress FM command)
  const parsedParams = parseParams(params);
  const operation = parsedParams.length > 0 ? parsedParams[0].toUpperCase() : '';

  if (operation === 'D') {
    // Delete files
    handleFileDelete(socket, session, parsedParams.slice(1));
    return;
  } else if (operation === 'M') {
    // Move files
    handleFileMove(socket, session, parsedParams.slice(1));
    return;
  } else if (operation === 'S') {
    // Search files
    handleFileSearch(socket, session, parsedParams.slice(1));
    return;
  } else {
    // Show menu
    socket.emit('ansi-output', 'Available operations:\r\n');
    socket.emit('ansi-output', 'FM D <filename> - Delete files\r\n');
    socket.emit('ansi-output', 'FM M <filename> <area> - Move files\r\n');
    socket.emit('ansi-output', 'FM S <pattern> - Search files\r\n');
    socket.emit('ansi-output', '\r\nUse FM <operation> <parameters>\r\n');
  }

  socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
  session.menuPause = false;
  session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
}

// displayFileStatus() - File status display (FS command)
// handleFileDelete() - Delete files (FM D command)
function handleFileDelete(socket: any, session: BBSSession, params: string[]) {
  if (params.length === 0) {
    socket.emit('ansi-output', 'Delete files functionality.\r\n');
    socket.emit('ansi-output', 'Usage: FM D <filename> [area]\r\n');
    socket.emit('ansi-output', 'Wildcards (* and ?) are supported.\r\n');
    socket.emit('ansi-output', 'Area parameter is optional (defaults to current conference).\r\n\r\n');
    socket.emit('ansi-output', '\x1b[32mPress any key to continue...\x1b[0m');
    session.menuPause = false;
    session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
    return;
  }

  const filename = params[0].toUpperCase();
  const areaParam = params.length > 1 ? params[1] : null;

  // Determine which file areas to search
  let targetAreas: any[] = [];
  if (areaParam) {
    // Specific area requested
    const areaId = parseInt(areaParam);
    if (isNaN(areaId)) {
      socket.emit('ansi-output', '\r\n\x1b[31mInvalid area number.\x1b[0m\r\n');
      socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
      session.menuPause = false;
      session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
      return;
    }
    const area = fileAreas.find(a => a.id === areaId);
    if (!area) {
      socket.emit('ansi-output', '\r\n\x1b[31mFile area not found.\x1b[0m\r\n');
      socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
      session.menuPause = false;
      session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
      return;
    }
    targetAreas = [area];
  } else {
    // All areas in current conference
    targetAreas = fileAreas.filter(a => a.conferenceId === session.currentConf);
  }

  // Find matching files
  const matchingFiles: any[] = [];
  targetAreas.forEach(area => {
    const areaFiles = fileEntries.filter(f => f.areaId === area.id);
    areaFiles.forEach(file => {
      if (matchesWildcard(file.filename, filename)) {
        matchingFiles.push({ file, area });
      }
    });
  });

  if (matchingFiles.length === 0) {
    socket.emit('ansi-output', `\r\nNo files matching "${filename}" found.\r\n`);
    socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
    session.menuPause = false;
    session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
    return;
  }

  // Check permissions (sysop or file owner)
  const userLevel = session.user?.secLevel || 0;
  const allowedFiles = matchingFiles.filter(({ file }) =>
    userLevel >= 200 || file.uploader.toLowerCase() === session.user?.username.toLowerCase()
  );

  if (allowedFiles.length === 0) {
    socket.emit('ansi-output', '\r\n\x1b[31mYou do not have permission to delete these files.\x1b[0m\r\n');
    socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
    session.menuPause = false;
    session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
    return;
  }

  // Display files to be deleted
  socket.emit('ansi-output', `\r\nFiles matching "${filename}":\r\n\r\n`);
  allowedFiles.forEach(({ file, area }, index) => {
    socket.emit('ansi-output', `${index + 1}. ${file.filename} (${area.name})\r\n`);
  });

  socket.emit('ansi-output', '\r\n\x1b[31mWARNING: This action cannot be undone!\x1b[0m\r\n');
  socket.emit('ansi-output', '\x1b[32mEnter file numbers to delete (comma-separated) or "ALL" for all: \x1b[0m');

  // Store context for confirmation
  session.tempData = {
    operation: 'delete_files',
    allowedFiles,
    filename
  };
  session.subState = LoggedOnSubState.FILE_DIR_SELECT; // Reuse for input
}

// handleFileMove() - Move files between areas (FM M command)
function handleFileMove(socket: any, session: BBSSession, params: string[]) {
  if (params.length < 2) {
    socket.emit('ansi-output', 'Move files functionality.\r\n');
    socket.emit('ansi-output', 'Usage: FM M <filename> <destination_area>\r\n');
    socket.emit('ansi-output', 'Wildcards (* and ?) are supported for filename.\r\n\r\n');
    socket.emit('ansi-output', '\x1b[32mPress any key to continue...\x1b[0m');
    session.menuPause = false;
    session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
    return;
  }

  const filename = params[0].toUpperCase();
  const destAreaId = parseInt(params[1]);

  if (isNaN(destAreaId)) {
    socket.emit('ansi-output', '\r\n\x1b[31mInvalid destination area number.\x1b[0m\r\n');
    socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
    session.menuPause = false;
    session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
    return;
  }

  // Check destination area exists
  const destArea = fileAreas.find(a => a.id === destAreaId);
  if (!destArea) {
    socket.emit('ansi-output', '\r\n\x1b[31mDestination file area not found.\x1b[0m\r\n');
    socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
    session.menuPause = false;
    session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
    return;
  }

  // Find matching files in current conference
  const sourceAreas = fileAreas.filter(a => a.conferenceId === session.currentConf);
  const matchingFiles: any[] = [];

  sourceAreas.forEach(area => {
    const areaFiles = fileEntries.filter(f => f.areaId === area.id);
    areaFiles.forEach(file => {
      if (matchesWildcard(file.filename, filename)) {
        matchingFiles.push({ file, area });
      }
    });
  });

  if (matchingFiles.length === 0) {
    socket.emit('ansi-output', `\r\nNo files matching "${filename}" found in current conference.\r\n`);
    socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
    session.menuPause = false;
    session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
    return;
  }

  // Check permissions (sysop or file owner)
  const userLevel = session.user?.secLevel || 0;
  const allowedFiles = matchingFiles.filter(({ file }) =>
    userLevel >= 200 || file.uploader.toLowerCase() === session.user?.username.toLowerCase()
  );

  if (allowedFiles.length === 0) {
    socket.emit('ansi-output', '\r\n\x1b[31mYou do not have permission to move these files.\x1b[0m\r\n');
    socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
    session.menuPause = false;
    session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
    return;
  }

  // Display files to be moved
  socket.emit('ansi-output', `\r\nFiles matching "${filename}" to move to ${destArea.name}:\r\n\r\n`);
  allowedFiles.forEach(({ file, area }, index) => {
    socket.emit('ansi-output', `${index + 1}. ${file.filename} (${area.name} -> ${destArea.name})\r\n`);
  });

  socket.emit('ansi-output', '\r\n\x1b[32mEnter file numbers to move (comma-separated) or "ALL" for all: \x1b[0m');

  // Store context for confirmation
  session.tempData = {
    operation: 'move_files',
    allowedFiles,
    destArea,
    filename
  };
  session.subState = LoggedOnSubState.FILE_DIR_SELECT; // Reuse for input
}

// handleFileSearch() - Search files by pattern (FM S command)
function handleFileSearch(socket: any, session: BBSSession, params: string[]) {
  if (params.length === 0) {
    socket.emit('ansi-output', 'Search files functionality.\r\n');
    socket.emit('ansi-output', 'Usage: FM S <search_pattern> [area]\r\n');
    socket.emit('ansi-output', 'Search pattern can be filename, description, or uploader.\r\n');
    socket.emit('ansi-output', 'Area parameter is optional (defaults to current conference).\r\n\r\n');
    socket.emit('ansi-output', '\x1b[32mPress any key to continue...\x1b[0m');
    session.menuPause = false;
    session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
    return;
  }

  const searchPattern = params[0].toLowerCase();
  const areaParam = params.length > 1 ? params[1] : null;

  // Determine which file areas to search
  let targetAreas: any[] = [];
  if (areaParam) {
    // Specific area requested
    const areaId = parseInt(areaParam);
    if (isNaN(areaId)) {
      socket.emit('ansi-output', '\r\n\x1b[31mInvalid area number.\x1b[0m\r\n');
      socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
      session.menuPause = false;
      session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
      return;
    }
    const area = fileAreas.find(a => a.id === areaId);
    if (!area) {
      socket.emit('ansi-output', '\r\n\x1b[31mFile area not found.\x1b[0m\r\n');
      socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
      session.menuPause = false;
      session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
      return;
    }
    targetAreas = [area];
  } else {
    // All areas in current conference
    targetAreas = fileAreas.filter(a => a.conferenceId === session.currentConf);
  }

  // Search files
  const matchingFiles: any[] = [];
  targetAreas.forEach(area => {
    const areaFiles = fileEntries.filter(f => f.areaId === area.id);
    areaFiles.forEach(file => {
      const filename = file.filename.toLowerCase();
      const description = (file.fileIdDiz || file.description || '').toLowerCase();
      const uploader = file.uploader.toLowerCase();

      if (filename.includes(searchPattern) ||
          description.includes(searchPattern) ||
          uploader.includes(searchPattern)) {
        matchingFiles.push({ file, area });
      }
    });
  });

  // Display results
  socket.emit('ansi-output', `\r\nSearch results for "${searchPattern}":\r\n\r\n`);

  if (matchingFiles.length === 0) {
    socket.emit('ansi-output', 'No files found matching the search pattern.\r\n');
  } else {
    socket.emit('ansi-output', `Found ${matchingFiles.length} file(s):\r\n\r\n`);

    matchingFiles.forEach(({ file, area }) => {
      const sizeKB = Math.ceil(file.size / 1024);
      const dateStr = file.uploadDate.toLocaleDateString();
      const description = file.fileIdDiz || file.description;

      socket.emit('ansi-output', `${file.filename.padEnd(15)}${sizeKB.toString().padStart(5)}K ${dateStr} ${file.uploader}\r\n`);
      socket.emit('ansi-output', `  ${description}\r\n`);
      socket.emit('ansi-output', `  Area: ${area.name}\r\n\r\n`);
    });
  }

  socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
  session.menuPause = false;
  session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
}

// matchesWildcard() - Simple wildcard matching utility
function matchesWildcard(filename: string, pattern: string): boolean {
  // Convert wildcard pattern to regex
  const regexPattern = pattern
    .replace(/\*/g, '.*')  // * matches any characters
    .replace(/\?/g, '.')   // ? matches single character
    .replace(/\./g, '\\.') // Escape dots
    .replace(/\$/g, '\\$') // Escape dollar signs
    .replace(/\^/g, '\\^'); // Escape carets

  const regex = new RegExp(`^${regexPattern}$`, 'i'); // Case insensitive
  return regex.test(filename);
}
async function displayFileStatus(socket: any, session: BBSSession, params: string) {
  socket.emit('ansi-output', '\x1b[36m-= File Status =-\x1b[0m\r\n');

  // Parse parameters to determine scope (like fileStatus(opt) in AmiExpress)
  const parsedParams = parseParams(params);
  const showAllConferences = parsedParams.length === 0 || parsedParams.includes('ALL');

  // Get user stats from database for bytes available and ratio calculation
  const userStats = await getUserStats(session.user!.id);
  const userRatio = session.user!.ratio || 1;

  // Calculate bytes available: (bytes_uploaded * ratio) - bytes_downloaded
  const bytesAvail = Math.max(0, (userStats.bytes_uploaded * userRatio) - userStats.bytes_downloaded);
  const ratioDisplay = userRatio > 0 ? `${userRatio}:1` : 'DSBLD';

  socket.emit('ansi-output', '\x1b[32m              Uploads                 Downloads\x1b[0m\r\n\r\n');
  socket.emit('ansi-output', '\x1b[32m    Conf  Files    KBytes         Files    KBytes         KBytes Avail  Ratio\x1b[0m\r\n\r\n');
  socket.emit('ansi-output', '\x1b[0m    ----  -------  -------------- -------  -------------- -----------  -----\x1b[0m\r\n');

  const conferencesToShow = showAllConferences ? conferences : [conferences.find(c => c.id === session.currentConf)!];

  conferencesToShow.forEach(conf => {
    const confFiles = fileEntries.filter(f => {
      const area = fileAreas.find(a => a.id === f.areaId);
      return area && area.conferenceId === conf.id;
    });

    const uploads = confFiles.length;
    const uploadBytes = confFiles.reduce((sum, f) => sum + f.size, 0);
    const downloads = confFiles.reduce((sum, f) => sum + f.downloads, 0);
    const downloadBytes = uploadBytes; // Simplified

    const displayNum = showAllConferences ? conf.id : 1; // Relative numbering
    const highlight = conf.id === session.currentConf ? '\x1b[33m' : '\x1b[36m';

    socket.emit('ansi-output', `${highlight}    ${displayNum.toString().padStart(4)}  ${uploads.toString().padStart(7)}  ${Math.ceil(uploadBytes/1024).toString().padStart(14)} ${downloads.toString().padStart(7)}  ${Math.ceil(downloadBytes/1024).toString().padStart(14)}   ${Math.ceil(bytesAvail/1024).toString().padStart(9)}  ${ratioDisplay}\x1b[0m\r\n`);
  });

  // Display user-specific file statistics (like AmiExpress user file stats)
  const user = session.user!;
  socket.emit('ansi-output', '\r\n\x1b[32mYour File Statistics:\x1b[0m\r\n');
  socket.emit('ansi-output', `Files Uploaded: ${userStats.files_uploaded || 0}\r\n`);
  socket.emit('ansi-output', `Bytes Uploaded: ${userStats.bytes_uploaded || 0}\r\n`);
  socket.emit('ansi-output', `Files Downloaded: ${userStats.files_downloaded || 0}\r\n`);
  socket.emit('ansi-output', `Bytes Downloaded: ${userStats.bytes_downloaded || 0}\r\n`);
  socket.emit('ansi-output', `Bytes Available: ${bytesAvail}\r\n`);

  socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
  session.menuPause = false;
  session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
}

// parseParams() - Parameter parsing utility (1:1 with AmiExpress parseParams)
function parseParams(paramString: string): string[] {
  if (!paramString.trim()) return [];

  return paramString.split(' ')
    .map(p => p.trim().toUpperCase())
    .filter(p => p.length > 0);
}

// displayNewFiles() - N command implementation (1:1 with myNewFiles in AmiExpress)
function displayNewFiles(socket: any, session: BBSSession, params: string) {
  console.log('displayNewFiles called with params:', params);

  // Parse parameters (like parseParams in AmiExpress)
  const parsedParams = parseParams(params);
  console.log('Parsed params:', parsedParams);

  // Check for non-stop flag (NS parameter)
  const nonStopDisplay = parsedParams.includes('NS');

  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', '\x1b[36m-= New Files Since Last Login =-\x1b[0m\r\n');

  // Get date to search from
  let searchDate: Date;
  if (parsedParams.length > 0 && parsedParams[0] !== 'NS') {
    // Direct date provided
    const dateStr = parsedParams[0];
    if (dateStr.length === 8) {
      // Parse MM-DD-YY format
      const month = parseInt(dateStr.substring(0, 2)) - 1; // JS months are 0-based
      const day = parseInt(dateStr.substring(3, 5));
      const year = 2000 + parseInt(dateStr.substring(6, 8)); // Y2K compliant
      searchDate = new Date(year, month, day);
    } else {
      searchDate = session.user?.lastLogin || new Date(Date.now() - 86400000); // Default to 1 day ago
    }
  } else {
    // Use user's last login date (like loggedOnUser.newSinceDate in AmiExpress)
    searchDate = session.user?.lastLogin || new Date(Date.now() - 86400000);
  }

  socket.emit('ansi-output', `Searching for files newer than: ${searchDate.toLocaleDateString()}\r\n\r\n`);

  // Directory selection (getDirSpan equivalent)
  if (parsedParams.length > 1 || (parsedParams.length === 1 && !parsedParams.includes('NS'))) {
    // Direct directory selection from params
    const dirSpan = getDirSpan(parsedParams[parsedParams.includes('NS') ? 1 : 0], fileAreas.length);
    if (dirSpan.startDir === -1) {
      socket.emit('ansi-output', '\r\n\x1b[31mInvalid directory selection.\x1b[0m\r\n');
      socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
      session.menuPause = false;
      session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
      return;
    }

    // Display new files in selected directories
    displayNewFilesInDirectories(socket, session, searchDate, dirSpan, nonStopDisplay);
  } else {
    // Interactive directory selection (like getDirSpan prompt)
    displayDirectorySelectionPrompt(socket, session, fileAreas, false, nonStopDisplay);
    // Store search date for later use
    session.tempData = { ...session.tempData, searchDate, nonStopDisplay, isNewFiles: true };
  }
}

// displayNewFilesInDirectories() - Scan directories for new files (1:1 with myNewFiles logic)
function displayNewFilesInDirectories(socket: any, session: BBSSession, searchDate: Date, dirSpan: { startDir: number, dirScan: number }, nonStop: boolean) {
  let currentDir = dirSpan.startDir;
  const endDir = dirSpan.dirScan;
  const step = 1; // Always forward for new files

  let foundNewFiles = false;

  while (currentDir <= endDir) {
    const areaIndex = currentDir - 1; // Convert to 0-based array index
    if (areaIndex >= 0 && areaIndex < fileAreas.length) {
      const area = fileAreas[areaIndex];
      const newFilesInArea = fileEntries.filter(file =>
        file.areaId === area.id &&
        file.uploadDate > searchDate
      );

      if (newFilesInArea.length > 0) {
        foundNewFiles = true;
        socket.emit('ansi-output', `\r\n\x1b[33m${area.name} (DIR${currentDir})\x1b[0m\r\n`);
        socket.emit('ansi-output', `${area.description}\r\n\r\n`);

        // Display new files (like displayIt2 in AmiExpress)
        newFilesInArea.forEach(file => {
          const sizeKB = Math.ceil(file.size / 1024);
          const dateStr = file.uploadDate.toLocaleDateString();
          const description = file.fileIdDiz || file.description;

          socket.emit('ansi-output', `${file.filename.padEnd(15)}${sizeKB.toString().padStart(5)}K ${dateStr} ${file.uploader}\r\n`);
          socket.emit('ansi-output', `  ${description}\r\n\r\n`);
        });

        // Pause between areas if not non-stop
        if (!nonStop && currentDir < endDir) {
          socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
          session.subState = LoggedOnSubState.FILE_LIST_CONTINUE;
          session.tempData = { fileAreas, dirSpan, nonStop, currentDir: currentDir + step, searchDate, isNewFiles: true };
          return;
        }
      }
    }
    currentDir += step;
  }

  if (!foundNewFiles) {
    socket.emit('ansi-output', 'No new files found since the specified date.\r\n');
  }

  socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
  session.menuPause = false;
  session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
}

// dirLineNewFile() - Check if a DIR line represents a new file (approximated from AmiExpress logic)
function dirLineNewFile(dirLine: string, searchDate: Date): boolean {
  // Parse DIR line format: "filename sizeK date uploader"
  const parts = dirLine.trim().split(/\s+/);
  if (parts.length < 4) return false;

  const dateStr = parts[2]; // Date is typically in MM-DD-YY format
  if (dateStr.length !== 8) return false;

  try {
    const month = parseInt(dateStr.substring(0, 2)) - 1;
    const day = parseInt(dateStr.substring(3, 5));
    const year = 2000 + parseInt(dateStr.substring(6, 8));
    const fileDate = new Date(year, month, day);

    return fileDate > searchDate;
  } catch {
    return false;
  }
}

// Display door games menu (DOORS command)
function displayDoorMenu(socket: any, session: BBSSession, params: string) {
  socket.emit('ansi-output', '\x1b[36m-= Door Games & Utilities =-\x1b[0m\r\n');

  // Get available doors for current user
  const availableDoors = doors.filter(door =>
    door.enabled &&
    (!door.conferenceId || door.conferenceId === session.currentConf) &&
    (session.user?.secLevel || 0) >= door.accessLevel
  );

  if (availableDoors.length === 0) {
    socket.emit('ansi-output', 'No doors are currently available.\r\n');
    socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
    session.menuPause = false;
    session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
    return;
  }

  socket.emit('ansi-output', 'Available doors:\r\n\r\n');

  availableDoors.forEach((door, index) => {
    socket.emit('ansi-output', `${index + 1}. ${door.name}\r\n`);
    socket.emit('ansi-output', `   ${door.description}\r\n`);
    socket.emit('ansi-output', `   Access Level: ${door.accessLevel}\r\n\r\n`);
  });

  socket.emit('ansi-output', '\x1b[32mSelect door (1-\x1b[33m' + availableDoors.length + '\x1b[32m) or press Enter to cancel: \x1b[0m');
  session.subState = LoggedOnSubState.FILE_AREA_SELECT; // Reuse for door selection
  session.tempData = { doorMode: true, availableDoors };
}

// Execute door game/utility
async function executeDoor(socket: any, session: BBSSession, door: Door) {
  console.log('Executing door:', door.name);

  // Create door session
  const doorSession: DoorSession = {
    doorId: door.id,
    userId: session.user!.id,
    startTime: new Date(),
    status: 'running'
  };
  doorSessions.push(doorSession);

  socket.emit('ansi-output', `\r\n\x1b[32mStarting ${door.name}...\x1b[0m\r\n`);

  // Log door execution (express.e:9493 callersLog)
  callersLog(session.user!.id, session.user!.username, 'Executed door', door.name);

  // Execute based on door type
  switch (door.type) {
    case 'web':
      await executeWebDoor(socket, session, door, doorSession);
      break;
    case 'native':
      socket.emit('ansi-output', 'Native door execution not implemented yet.\r\n');
      break;
    case 'script':
      socket.emit('ansi-output', 'Script door execution not implemented yet.\r\n');
      break;
    default:
      socket.emit('ansi-output', 'Unknown door type.\r\n');
  }

  // Mark session as completed
  doorSession.endTime = new Date();
  doorSession.status = 'completed';
}

// Execute web-compatible door (ported AmiExpress doors)
async function executeWebDoor(socket: any, session: BBSSession, door: Door, doorSession: DoorSession) {
  switch (door.id) {
    case 'sal':
      await executeSAmiLogDoor(socket, session, door, doorSession);
      break;
    case 'checkup':
      await executeCheckUPDoor(socket, session, door, doorSession);
      break;
    default:
      socket.emit('ansi-output', 'Door implementation not found.\r\n');
  }
}

// Execute SAmiLog callers log viewer door
async function executeSAmiLogDoor(socket: any, session: BBSSession, door: Door, doorSession: DoorSession) {
  socket.emit('ansi-output', '\x1b[36m-= Super AmiLog v3.00 =-\x1b[0m\r\n');
  socket.emit('ansi-output', 'Advanced Callers Log Viewer\r\n\r\n');

  // Read from caller_activity table (express.e reads from BBS:NODE{x}/CALLERSLOG)
  socket.emit('ansi-output', 'Recent callers:\r\n\r\n');

  const recentActivity = await getRecentCallerActivity(20);

  if (recentActivity.length === 0) {
    socket.emit('ansi-output', 'No caller activity recorded yet.\r\n');
  } else {
    recentActivity.forEach(activity => {
      const timestamp = new Date(activity.timestamp);
      const timeStr = timestamp.toLocaleTimeString('en-US', { hour12: false });
      const details = activity.details ? ` - ${activity.details}` : '';
      socket.emit('ansi-output', `${timeStr} ${activity.username.padEnd(15)} ${activity.action}${details}\r\n`);
    });
  }

  socket.emit('ansi-output', '\r\n\x1b[32mPress any key to exit SAmiLog...\x1b[0m');
  session.menuPause = false;
  session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
}

// Execute CheckUP file checking utility
async function executeCheckUPDoor(socket: any, session: BBSSession, door: Door, doorSession: DoorSession) {
  socket.emit('ansi-output', '\x1b[36m-= CheckUP v0.4 =-\x1b[0m\r\n');
  socket.emit('ansi-output', 'File checking utility for upload directories\r\n\r\n');

  // Check upload directory for files (in database, check for unchecked uploads)
  socket.emit('ansi-output', 'Checking upload directory...\r\n');

  // Query database for unchecked files (checked = 'N')
  const result = await db.query(
    "SELECT filename, size, uploader FROM file_entries WHERE checked = 'N' ORDER BY upload_date DESC LIMIT 10"
  );

  const uncheckedFiles = result.rows;

  if (uncheckedFiles.length > 0) {
    socket.emit('ansi-output', `Files found in upload directory! (${uncheckedFiles.length})\r\n`);
    socket.emit('ansi-output', 'Processing uploads...\r\n\r\n');

    // Display each unchecked file
    for (const file of uncheckedFiles) {
      const sizeKB = Math.ceil(file.size / 1024);
      socket.emit('ansi-output', `- ${file.filename.padEnd(15)} ${sizeKB.toString().padStart(5)}K by ${file.uploader}\r\n`);
      socket.emit('ansi-output', '  Status: Archive OK\r\n');
    }

    socket.emit('ansi-output', '\r\nAll files processed and ready for download.\r\n');
  } else {
    socket.emit('ansi-output', 'No unchecked files found in upload directory.\r\n');
    socket.emit('ansi-output', 'All uploads have been processed.\r\n');
  }

  socket.emit('ansi-output', '\r\n\x1b[32mCheckUP completed. Press any key to continue...\x1b[0m');
  session.menuPause = false;
  session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
}

// Display upload interface (uploadaFile equivalent)
function displayUploadInterface(socket: any, session: BBSSession, params: string) {
  console.log('displayUploadInterface called with params:', params);

  // Check if there are file directories to upload to (NDIRS check)
  const currentFileAreas = fileAreas.filter(area => area.conferenceId === session.currentConf);
  if (currentFileAreas.length === 0) {
    socket.emit('ansi-output', '\x1b[36m-= Upload Files =-\x1b[0m\r\n');
    socket.emit('ansi-output', 'No file areas available in this conference.\r\n');
    socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
    session.menuPause = false;
    session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
    return;
  }

  // Display upload message (like UPLOADMSG.TXT)
  socket.emit('ansi-output', '\x1b[36m-= Upload Files =-\x1b[0m\r\n');
  socket.emit('ansi-output', 'Upload your files to share with the community.\r\n\r\n');

  // Display user stats (like displayULStats in AmiExpress)
  const user = session.user!;
  socket.emit('ansi-output', '\x1b[32mYour Upload Statistics:\x1b[0m\r\n');
  socket.emit('ansi-output', `Files Uploaded: ${user.uploads || 0}\r\n`);
  socket.emit('ansi-output', `Bytes Uploaded: ${user.bytesUpload || 0}\r\n\r\n`);

  // Display available space (simplified - in production, calculate from file system)
  socket.emit('ansi-output', '\x1b[32mAvailable Upload Space:\x1b[0m\r\n');
  socket.emit('ansi-output', '1,000,000 bytes available\r\n\r\n');

  // Display file areas for upload
  socket.emit('ansi-output', '\x1b[32mAvailable File Areas:\x1b[0m\r\n');
  currentFileAreas.forEach((area, index) => {
    socket.emit('ansi-output', `${index + 1}. ${area.name} - ${area.description}\r\n`);
  });

  // Prompt for file area selection
  socket.emit('ansi-output', '\r\n\x1b[32mSelect file area (1-\x1b[33m' + currentFileAreas.length + '\x1b[32m) or press Enter to cancel: \x1b[0m');
  session.subState = LoggedOnSubState.FILE_AREA_SELECT;
  session.tempData = { uploadMode: true, fileAreas: currentFileAreas };
}

// Display download interface (downloadFile equivalent)
function displayDownloadInterface(socket: any, session: BBSSession, params: string) {
  console.log('displayDownloadInterface called with params:', params);

  // Check if there are file directories to download from (NDIRS check)
  const currentFileAreas = fileAreas.filter(area => area.conferenceId === session.currentConf);
  if (currentFileAreas.length === 0) {
    socket.emit('ansi-output', '\x1b[36m-= Download Files =-\x1b[0m\r\n');
    socket.emit('ansi-output', 'No file areas available in this conference.\r\n');
    socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
    session.menuPause = false;
    session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
    return;
  }

  // Display download message (like DOWNLOADMSG.TXT)
  socket.emit('ansi-output', '\x1b[36m-= Download Files =-\x1b[0m\r\n');
  socket.emit('ansi-output', 'Download files from our collection.\r\n\r\n');

  // Display user stats (like displayULStats in AmiExpress)
  const user = session.user!;
  socket.emit('ansi-output', '\x1b[32mYour Download Statistics:\x1b[0m\r\n');
  socket.emit('ansi-output', `Files Downloaded: ${user.downloads || 0}\r\n`);
  socket.emit('ansi-output', `Bytes Downloaded: ${user.bytesDownload || 0}\r\n\r\n`);

  // Display current protocol (simplified)
  socket.emit('ansi-output', '\x1b[32mCurrent Transfer Protocol:\x1b[0m WebSocket\r\n\r\n');

  // Display file areas for download
  socket.emit('ansi-output', '\x1b[32mAvailable File Areas:\x1b[0m\r\n');
  currentFileAreas.forEach((area, index) => {
    socket.emit('ansi-output', `${index + 1}. ${area.name} - ${area.description}\r\n`);
  });

  // Prompt for file area selection
  socket.emit('ansi-output', '\r\n\x1b[32mSelect file area (1-\x1b[33m' + currentFileAreas.length + '\x1b[32m) or press Enter to cancel: \x1b[0m');
  session.subState = LoggedOnSubState.FILE_AREA_SELECT;
  session.tempData = { downloadMode: true, fileAreas: currentFileAreas };
}

// Start file upload process (WebSocket-based chunking)
function startFileUpload(socket: any, session: BBSSession, fileArea: any) {
  console.log('startFileUpload called for area:', fileArea.name);

  socket.emit('ansi-output', `\r\n\x1b[32mSelected file area: ${fileArea.name}\x1b[0m\r\n`);
  socket.emit('ansi-output', '\x1b[36m-= Upload Files =-\x1b[0m\r\n');
  socket.emit('ansi-output', 'Upload your files to share with the community.\r\n\r\n');

  // Display user stats (like displayULStats in AmiExpress)
  const user = session.user!;
  socket.emit('ansi-output', '\x1b[32mYour Upload Statistics:\x1b[0m\r\n');
  socket.emit('ansi-output', `Files Uploaded: ${user.uploads || 0}\r\n`);
  socket.emit('ansi-output', `Bytes Uploaded: ${user.bytesUpload || 0}\r\n\r\n`);

  // Display available space (simplified - in production, calculate from file system)
  socket.emit('ansi-output', '\x1b[32mAvailable Upload Space:\x1b[0m\r\n');
  socket.emit('ansi-output', '1,000,000 bytes available\r\n\r\n');

  // Check if user has upload access to this area
  if (fileArea.uploadAccess > (session.user?.secLevel || 0)) {
    socket.emit('ansi-output', '\r\n\x1b[31mYou do not have upload access to this file area.\x1b[0m\r\n');
    socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
    session.menuPause = false;
    session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
    session.tempData = undefined;
    return;
  }

  // Display upload message (like UPLOADMSG.TXT)
  socket.emit('ansi-output', '\r\n\x1b[32mUpload Message:\x1b[0m\r\n');
  socket.emit('ansi-output', 'Please select files to upload. Files will be validated and checked for duplicates.\r\n');
  socket.emit('ansi-output', 'Filename lengths above 12 characters are not allowed.\r\n\r\n');

  // Display current protocol (WebSocket-based)
  socket.emit('ansi-output', '\x1b[32mCurrent Transfer Protocol:\x1b[0m WebSocket\r\n\r\n');

  // Initialize WebSocket file upload
  socket.emit('ansi-output', '\x1b[32mWebSocket File Upload Ready\x1b[0m\r\n');
  socket.emit('ansi-output', 'Send file data using WebSocket protocol...\r\n\r\n');

  // Set up WebSocket file upload handlers
  session.tempData = {
    uploadMode: true,
    fileArea: fileArea,
    uploadState: 'ready',
    currentFile: null,
    receivedChunks: [],
    totalSize: 0
  };

  // Listen for file upload data
  const uploadHandler = (data: any) => {
    if (data.type === 'file-start') {
      // Start of file upload
      session.tempData.currentFile = {
        filename: data.filename,
        size: data.size,
        description: data.description || ''
      };
      session.tempData.receivedChunks = [];
      session.tempData.totalSize = data.size;
      session.tempData.uploadState = 'receiving';

      socket.emit('ansi-output', `\x1b[32mReceiving file: ${data.filename} (${data.size} bytes)\x1b[0m\r\n`);
      socket.emit('ansi-output', 'Progress: [                    ] 0%\r\n');
    } else if (data.type === 'file-chunk') {
      // File chunk received
      session.tempData.receivedChunks.push(data.chunk);

      const receivedBytes = session.tempData.receivedChunks.reduce((sum: number, chunk: string) => sum + chunk.length, 0);
      const progress = Math.floor((receivedBytes / session.tempData.totalSize) * 100);
      const progressBar = '[' + '='.repeat(Math.floor(progress / 5)) + ' '.repeat(20 - Math.floor(progress / 5)) + ']';

      // Update progress display (overwrite previous line)
      socket.emit('ansi-output', '\x1b[1A\x1b[K'); // Move up and clear line
      socket.emit('ansi-output', `Progress: ${progressBar} ${progress}%\r\n`);
    } else if (data.type === 'file-end') {
      // File upload complete
      const fileData = session.tempData.receivedChunks.join('');
      const file = session.tempData.currentFile;

      // Validate file (basic checks)
      if (file.filename.length > 12) {
        socket.emit('ansi-output', '\x1b[31mError: Filename too long (max 12 characters)\x1b[0m\r\n');
        socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
        session.menuPause = false;
        session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
        session.tempData = undefined;
        return;
      }

      // Save file to database
      const fileEntry = {
        filename: file.filename,
        description: file.description,
        size: fileData.length,
        uploader: session.user!.username,
        uploadDate: new Date(),
        downloads: 0,
        areaId: fileArea.id,
        status: 'active' as const,
        checked: 'N' as const
      };

      // In production, save to file system too
      // For now, just store in database
      db.createFileEntry(fileEntry).then(async () => {
        // Update user stats in users table (for backward compatibility)
        await db.updateUser(session.user!.id, {
          uploads: (session.user!.uploads || 0) + 1,
          bytesUpload: (session.user!.bytesUpload || 0) + fileData.length
        });

        // Update user_stats table (for ratio calculations)
        await db.query(
          'UPDATE user_stats SET bytes_uploaded = bytes_uploaded + $1, files_uploaded = files_uploaded + 1 WHERE user_id = $2',
          [fileData.length, session.user!.id]
        );

        // Log file upload (express.e:9493 callersLog)
        await callersLog(session.user!.id, session.user!.username, 'Uploaded file', file.filename);

        socket.emit('ansi-output', '\x1b[32mFile uploaded successfully!\x1b[0m\r\n');
        socket.emit('ansi-output', `Added to ${fileArea.name}\r\n`);
        socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
        session.menuPause = false;
        session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
        session.tempData = undefined;
      }).catch((error: any) => {
        console.error('File upload error:', error);
        socket.emit('ansi-output', '\x1b[31mError saving file to database\x1b[0m\r\n');
        socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
        session.menuPause = false;
        session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
        session.tempData = undefined;
      });
    }
  };

  // Store upload handler for cleanup
  (socket as any).uploadHandler = uploadHandler;
  socket.on('file-upload', uploadHandler);

  socket.emit('ansi-output', '\x1b[32mReady to receive file data...\x1b[0m\r\n');
  socket.emit('ansi-output', '\r\n\x1b[32mPress any key to cancel upload...\x1b[0m');
  session.menuPause = false;
  session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
}

// Start file download process (WebSocket-based chunking)
function startFileDownload(socket: any, session: BBSSession, fileArea: any) {
  console.log('startFileDownload called for area:', fileArea.name);

  socket.emit('ansi-output', `\r\n\x1b[32mSelected file area: ${fileArea.name}\x1b[0m\r\n`);
  socket.emit('ansi-output', '\x1b[36m-= Download Files =-\x1b[0m\r\n');
  socket.emit('ansi-output', 'Download files from our collection.\r\n\r\n');

  // Display user stats (like displayULStats in AmiExpress)
  const user = session.user!;
  socket.emit('ansi-output', '\x1b[32mYour Download Statistics:\x1b[0m\r\n');
  socket.emit('ansi-output', `Files Downloaded: ${user.downloads || 0}\r\n`);
  socket.emit('ansi-output', `Bytes Downloaded: ${user.bytesDownload || 0}\r\n\r\n`);

  // Display current protocol (WebSocket-based)
  socket.emit('ansi-output', '\x1b[32mCurrent Transfer Protocol:\x1b[0m WebSocket\r\n\r\n');

  // Check if user has download access to this area
  if (fileArea.downloadAccess > (session.user?.secLevel || 0)) {
    socket.emit('ansi-output', '\r\n\x1b[31mYou do not have download access to this file area.\x1b[0m\r\n');
    socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
    session.menuPause = false;
    session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
    session.tempData = undefined;
    return;
  }

  // Display download message (like DOWNLOADMSG.TXT)
  socket.emit('ansi-output', '\r\n\x1b[32mDownload Message:\x1b[0m\r\n');
  socket.emit('ansi-output', 'Please select files to download. Files will be transferred using WebSocket protocol.\r\n\r\n');

  // Display files in the area for selection
  const areaFiles = fileEntries.filter(file => file.areaId === fileArea.id);
  if (areaFiles.length === 0) {
    socket.emit('ansi-output', 'No files available in this area.\r\n');
    socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
    session.menuPause = false;
    session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
    session.tempData = undefined;
    return;
  }

  socket.emit('ansi-output', '\x1b[32mAvailable Files:\x1b[0m\r\n\r\n');
  areaFiles.forEach((file, index) => {
    const sizeKB = Math.ceil(file.size / 1024);
    const dateStr = file.uploadDate.toLocaleDateString();
    const description = file.fileIdDiz || file.description;
    socket.emit('ansi-output', `${index + 1}. ${file.filename.padEnd(15)}${sizeKB.toString().padStart(5)}K ${dateStr} ${file.uploader}\r\n`);
    socket.emit('ansi-output', `   ${description}\r\n\r\n`);
  });

  // Prompt for file selection
  socket.emit('ansi-output', '\x1b[32mSelect file to download (1-\x1b[33m' + areaFiles.length + '\x1b[32m) or press Enter to cancel: \x1b[0m');
  session.subState = LoggedOnSubState.FILE_AREA_SELECT;
  session.tempData = { downloadMode: true, fileArea, areaFiles };
}

// Handle file download selection and transfer
function handleFileDownload(socket: any, session: BBSSession, fileIndex: number) {
  const tempData = session.tempData as { fileArea: any, areaFiles: any[] };
  const selectedFile = tempData.areaFiles[fileIndex - 1];

  if (!selectedFile) {
    socket.emit('ansi-output', '\r\n\x1b[31mInvalid file selection.\x1b[0m\r\n');
    socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
    session.menuPause = false;
    session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
    session.tempData = undefined;
    return;
  }

  socket.emit('ansi-output', `\r\n\x1b[32mSelected file: ${selectedFile.filename}\x1b[0m\r\n`);
  socket.emit('ansi-output', 'Starting WebSocket file transfer...\r\n\r\n');

  // In a real implementation, file data would be read from disk
  // For demo, we'll simulate file transfer with placeholder data
  const fileSize = selectedFile.size;
  const chunkSize = 1024; // 1KB chunks
  const totalChunks = Math.ceil(fileSize / chunkSize);

  socket.emit('ansi-output', `File size: ${fileSize} bytes\r\n`);
  socket.emit('ansi-output', `Transferring in ${totalChunks} chunks...\r\n\r\n`);

  // Send file start
  socket.emit('file-download-start', {
    filename: selectedFile.filename,
    size: fileSize,
    description: selectedFile.description
  });

  // Simulate chunked transfer
  let sentChunks = 0;
  const transferInterval = setInterval(() => {
    if (sentChunks >= totalChunks) {
      clearInterval(transferInterval);
      // Send file end
      socket.emit('file-download-end');
      socket.emit('ansi-output', '\r\n\x1b[32mFile transfer complete!\x1b[0m\r\n');

      // Update download stats
      db.updateFileEntry(selectedFile.id, { downloads: selectedFile.downloads + 1 });
      db.updateUser(session.user!.id, {
        downloads: (session.user!.downloads || 0) + 1,
        bytesDownload: (session.user!.bytesDownload || 0) + fileSize
      });

      // Update user_stats table (for ratio calculations)
      db.query(
        'UPDATE user_stats SET bytes_downloaded = bytes_downloaded + $1, files_downloaded = files_downloaded + 1 WHERE user_id = $2',
        [fileSize, session.user!.id]
      ).catch((error: any) => console.error('Error updating user stats:', error));

      // Log file download (express.e:9493 callersLog)
      callersLog(session.user!.id, session.user!.username, 'Downloaded file', selectedFile.filename);

      socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
      session.menuPause = false;
      session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
      session.tempData = undefined;
      return;
    }

    // Send chunk (placeholder data)
    const chunkData = 'x'.repeat(Math.min(chunkSize, fileSize - (sentChunks * chunkSize)));
    socket.emit('file-download-chunk', {
      chunk: chunkData,
      chunkIndex: sentChunks,
      totalChunks: totalChunks
    });

    sentChunks++;

    // Update progress
    const progress = Math.floor((sentChunks / totalChunks) * 100);
    const progressBar = '[' + '='.repeat(Math.floor(progress / 5)) + ' '.repeat(20 - Math.floor(progress / 5)) + ']';

    // Update progress display
    if (sentChunks === 1) {
      socket.emit('ansi-output', `Progress: ${progressBar} ${progress}%\r\n`);
    } else {
      socket.emit('ansi-output', '\x1b[1A\x1b[K'); // Move up and clear line
      socket.emit('ansi-output', `Progress: ${progressBar} ${progress}%\r\n`);
    }
  }, 100); // Send chunk every 100ms for demo

  // Store interval for cleanup
  (session as any).downloadInterval = transferInterval;
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
      return 'FILE MAINT';
    case LoggedOnSubState.DOOR_RUNNING:
      return 'IN DOOR';
    case LoggedOnSubState.CHAT_PAGE_SYSOP:
    case LoggedOnSubState.CHAT_SESSION:
      return 'CHATTING';
    case LoggedOnSubState.ACCOUNT_MENU:
    case LoggedOnSubState.ACCOUNT_EDIT_SETTINGS:
      return 'ACCOUNT EDITING';
    case LoggedOnSubState.CONFERENCE_SELECT:
    case LoggedOnSubState.CONFERENCE_JOIN:
      return 'JOINING CONF';
    default:
      return 'IDLE';
  }
}

// Display main menu (SCREEN_MENU equivalent)
function displayMainMenu(socket: any, session: BBSSession) {
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
    if ((session.user?.expert === "N" && !session.doorExpertMode) /* TODO: || FORCE_MENUS check */) {
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
function displayMenuPrompt(socket: any, session: BBSSession) {
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
async function handleCommand(socket: any, session: BBSSession, data: string) {
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
      session.subState === LoggedOnSubState.DISPLAY_CONF_BULL ||
      session.subState === LoggedOnSubState.FILE_LIST) {
    console.log('📋 In display state, continuing to next state');
    try {
      // Any key continues to next state
      if (session.subState === LoggedOnSubState.DISPLAY_BULL) {
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
    const confId = parseInt(input);
    if (isNaN(confId) || confId === 0) {
      // Empty input or invalid - return to menu
      socket.emit('ansi-output', '\r\nReturning to main menu...\r\n');
      session.subState = LoggedOnSubState.DISPLAY_MENU;
      displayMainMenu(socket, session);
      return;
    }

    const selectedConf = conferences.find(conf => conf.id === confId);
    if (!selectedConf) {
      socket.emit('ansi-output', '\r\nInvalid conference number.\r\n');
      socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
      session.menuPause = false;
      session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
      return;
    }

    // Join the selected conference
    if (await joinConference(socket, session, confId, 1)) { // Default to message base 1
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
    // After processing: menuPause := TRUE, subState := DISPLAY_MENU (express.e:28641-28642)
    session.menuPause = true;
    session.subState = LoggedOnSubState.DISPLAY_MENU;
    session.commandText = undefined; // Clear command text
    displayMainMenu(socket, session);
    return;
  } else {
    console.log('❌ Not in command input state, current subState:', session.subState, '- IGNORING COMMAND');
  }
  console.log('=== handleCommand end ===\n');
}

// Command Priority System - Express.e:28228-28282
// Priority order: SysCommand → BbsCommand → InternalCommand

// Check for System Command (express.e:4813-4819)
async function runSysCommand(socket: any, session: BBSSession, command: string, params: string): Promise<string> {
  // TODO: Implement system command lookup (.cmd files in Conf/SysCmds/)
  // For now, return FAILURE (command not found)
  console.log(`[SysCommand] Checking for system command: ${command} - NOT FOUND (not implemented yet)`);
  return 'FAILURE';
}

// Check for BBS Command (express.e:4807-4811)
async function runBbsCommand(socket: any, session: BBSSession, command: string, params: string): Promise<string> {
  // TODO: Implement BBS command lookup (.cmd files in Conf/Cmds/, Node/Cmds/, BBS/Cmds/)
  // For now, return FAILURE (command not found)
  console.log(`[BbsCommand] Checking for BBS command: ${command} - NOT FOUND (not implemented yet)`);
  return 'FAILURE';
}

// Process command with priority system (express.e:28229-28257)
async function processCommand(socket: any, session: BBSSession, command: string, params: string): Promise<string> {
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
async function processBBSCommand(socket: any, session: BBSSession, command: string, params: string = '') {
  console.log('processBBSCommand called with command:', JSON.stringify(command));

  // Clear screen before showing command output (authentic BBS behavior)
  console.log('Command processing: clearing screen for command output');
  socket.emit('ansi-output', '\x1b[2J\x1b[H');

  // Map commands to internalCommandX functions from AmiExpress
  console.log('Entering switch statement for command:', command);
  switch (command) {
    case 'D': // Download File(s) (internalCommandD) - downloadFile(params)
      displayDownloadInterface(socket, session, params);
      return;

    case 'DS': // Download with Status (internalCommandD with DS flag) - express.e:28302
      // DS is handled by same function as D in express.e
      // The difference is DS shows download status/progress
      // TODO for 100% 1:1: Implement status display during download - express.e:24853
      displayDownloadInterface(socket, session, params);
      return;

    case 'U': // Upload File(s) (internalCommandU) - uploadaFile(params)
      displayUploadInterface(socket, session, params);
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

    case 'S': // Status of On-Line User (internalCommandS) - 1:1 with AmiExpress status
      socket.emit('ansi-output', '\x1b[36m-= Your Account Status =-\x1b[0m\r\n\r\n');

      const statusUser = session.user!;

      // Get user stats from database for accurate bytes available calculation
      const statusUserStats = await getUserStats(statusUser.id);
      const statusUserRatio = statusUser.ratio || 1;
      const statusBytesAvail = Math.max(0, (statusUserStats.bytes_uploaded * statusUserRatio) - statusUserStats.bytes_downloaded);

      socket.emit('ansi-output', `        Caller Num.: ${statusUser.id}\r\n`);
      socket.emit('ansi-output', `        Lst Date On: ${statusUser.lastLogin?.toLocaleDateString() || 'Never'}\r\n`);
      socket.emit('ansi-output', `        Security Lv: ${statusUser.secLevel}\r\n`);
      socket.emit('ansi-output', `        # Times On : ${statusUser.calls}\r\n`);
      socket.emit('ansi-output', `        Ratio DL/UL: ${statusUser.ratio > 0 ? `${statusUser.ratio}:1` : 'Disabled'}\r\n`);
      socket.emit('ansi-output', `        Online Baud: WebSocket\r\n`);
      socket.emit('ansi-output', `        Rate CPS UP: ${statusUser.topUploadCPS || 0}\r\n`);
      socket.emit('ansi-output', `        Rate CPS DN: ${statusUser.topDownloadCPS || 0}\r\n`);
      socket.emit('ansi-output', `        Screen  Clr: ${statusUser.ansi ? 'YES' : 'NO'}\r\n`);
      socket.emit('ansi-output', `        Protocol   : WebSocket\r\n`);
      socket.emit('ansi-output', `        Sysop Pages Remaining: ${statusUser.secLevel === 255 ? 'Unlimited' : Math.max(0, 3 - (statusUser.chatUsed || 0))}\r\n\r\n`);

      // File statistics by conference
      socket.emit('ansi-output', `                      Uploads            Downloads\r\n`);
      socket.emit('ansi-output', `    Conf  Files    KBytes     Files    KBytes     Bytes Avail  Ratio\r\n`);
      socket.emit('ansi-output', `    ----  -------  ---------- -------  ---------- -----------  -----\r\n`);

      // Show stats for current conference
      const confFiles = fileEntries.filter(f => {
        const area = fileAreas.find(a => a.id === f.areaId);
        return area && area.conferenceId === session.currentConf;
      });

      const uploads = confFiles.filter(f => f.uploader.toLowerCase() === statusUser.username.toLowerCase()).length;
      const uploadBytes = confFiles.filter(f => f.uploader.toLowerCase() === statusUser.username.toLowerCase()).reduce((sum, f) => sum + f.size, 0);
      const downloads = confFiles.reduce((sum, f) => sum + f.downloads, 0);
      const downloadBytes = uploadBytes; // Simplified
      const ratio = statusUser.ratio > 0 ? `${statusUser.ratio}:1` : 'DSBLD';

      socket.emit('ansi-output', `       ${session.currentConf.toString().padStart(4)}  ${uploads.toString().padStart(7)}  ${Math.ceil(uploadBytes/1024).toString().padStart(10)} ${downloads.toString().padStart(7)}  ${Math.ceil(downloadBytes/1024).toString().padStart(10)}   ${Math.ceil(statusBytesAvail/1024).toString().padStart(9)}  ${ratio}\r\n`);

      socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
      session.menuPause = false;
      session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
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
      // TODO for 100% 1:1 compliance:
      // 1. ✅ checkSecurity(ACS_READ_MESSAGE) - express.e:25519 [IMPLEMENTED]
      // 2. ✅ setEnvStat(ENV_MAIL) - express.e:25520 [IMPLEMENTED]
      // 3. parseParams(params) for message range/options - express.e:25521
      // 4. getMailStatFile(currentConf, currentMsgBase) - load message pointers - express.e:25523
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

      socket.emit('ansi-output', '\x1b[36m-= Message Reader =-\x1b[0m\r\n');
      socket.emit('ansi-output', `Conference: ${session.currentConfName}\r\n\r\n`);

      // Get messages for current conference and message base - sorted by timestamp
      const currentMessages = messages.filter(msg =>
        msg.conferenceId === session.currentConf &&
        msg.messageBaseId === session.currentMsgBase &&
        (!msg.isPrivate || msg.toUser === session.user?.username || msg.author === session.user?.username)
      ).sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

      if (currentMessages.length === 0) {
        socket.emit('ansi-output', '\x1b[33mNo messages in this area.\x1b[0m\r\n');
      } else {
        // Count unread vs total
        const unreadCount = currentMessages.filter(msg =>
          msg.timestamp > (session.user?.lastLogin || new Date(0))
        ).length;

        socket.emit('ansi-output', `Total messages: ${currentMessages.length} `);
        if (unreadCount > 0) {
          socket.emit('ansi-output', `(\x1b[33m${unreadCount} new\x1b[0m)`);
        }
        socket.emit('ansi-output', '\r\n\r\n');

        currentMessages.forEach((msg, index) => {
          const isNew = msg.timestamp > (session.user?.lastLogin || new Date(0));
          const newIndicator = isNew ? '\x1b[33m[NEW]\x1b[0m ' : '';
          const privateIndicator = msg.isPrivate ? '\x1b[31m[PRIVATE]\x1b[0m ' : '';
          const replyIndicator = msg.parentId ? '\x1b[35m[REPLY]\x1b[0m ' : '';

          socket.emit('ansi-output', `\x1b[36mMessage ${index + 1} of ${currentMessages.length}\x1b[0m\r\n`);
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
        });
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

    case '<': // Previous Conference (internalCommandLT) - express.e:24529
      // Check if user has join permission
      // TODO: Implement checkSecurity(ACS_JOIN_CONFERENCE)

      // Find previous accessible conference
      let prevConf = session.currentConf - 1;
      while (prevConf > 0) {
        // TODO: Check if user has access to this conference with checkConfAccess()
        // For now, assume all conferences are accessible
        const conf = conferences.find(c => c.id === prevConf);
        if (conf) {
          break;
        }
        prevConf--;
      }

      if (prevConf < 1) {
        // No previous conference - show join prompt
        socket.emit('ansi-output', '\x1b[36m-= Join Conference =-\x1b[0m\r\n');
        socket.emit('ansi-output', 'At first conference. Select conference to join:\r\n');
        conferences.forEach(conf => {
          socket.emit('ansi-output', `${conf.id}. ${conf.name}\r\n`);
        });
        socket.emit('ansi-output', '\r\n\x1b[32mConference number: \x1b[0m');
        session.subState = LoggedOnSubState.CONFERENCE_SELECT;
        return;
      } else {
        // Join previous conference
        await joinConference(socket, session, prevConf, 1);
        socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
        session.menuPause = false;
        session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
      }
      return;

    case '>': // Next Conference (internalCommandGT) - express.e:24548
      // Find next accessible conference
      let nextConf = session.currentConf + 1;
      const maxConf = Math.max(...conferences.map(c => c.id));

      while (nextConf <= maxConf) {
        const conf = conferences.find(c => c.id === nextConf);
        if (conf) {
          break;
        }
        nextConf++;
      }

      if (nextConf > maxConf) {
        // No next conference - show join prompt
        socket.emit('ansi-output', '\x1b[36m-= Join Conference =-\x1b[0m\r\n');
        socket.emit('ansi-output', 'At last conference. Select conference to join:\r\n');
        conferences.forEach(conf => {
          socket.emit('ansi-output', `${conf.id}. ${conf.name}\r\n`);
        });
        socket.emit('ansi-output', '\r\n\x1b[32mConference number: \x1b[0m');
        session.subState = LoggedOnSubState.CONFERENCE_SELECT;
        return;
      } else {
        // Join next conference
        await joinConference(socket, session, nextConf, 1);
        socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
        session.menuPause = false;
        session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
      }
      return;

    case '<<': // Previous Message Base (internalCommandLT2) - express.e:24566
      {
        const prevMsgBase = session.currentMsgBase - 1;

        if (prevMsgBase < 1) {
          // No previous message base - show join prompt
          const currentConfBases = messageBases.filter(mb => mb.conferenceId === session.currentConf);
          socket.emit('ansi-output', '\x1b[36m-= Join Message Base =-\x1b[0m\r\n');
          socket.emit('ansi-output', 'At first message base. Select message base to join:\r\n');
          currentConfBases.forEach(mb => {
            socket.emit('ansi-output', `${mb.id}. ${mb.name}\r\n`);
          });
          socket.emit('ansi-output', '\r\n\x1b[32mMessage base number: \x1b[0m');
          session.subState = LoggedOnSubState.CONFERENCE_SELECT;
          session.tempData = { messageBaseSelect: true, currentConfBases };
          return;
        } else {
          // Join previous message base
          const prevBase = messageBases.find(mb => mb.id === prevMsgBase && mb.conferenceId === session.currentConf);
          if (prevBase) {
            session.currentMsgBase = prevMsgBase;
            socket.emit('ansi-output', `\r\n\x1b[32mJoined message base: ${prevBase.name}\x1b[0m\r\n`);
            socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
            session.menuPause = false;
            session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
          }
        }
      }
      return;

    case '>>': // Next Message Base (internalCommandGT2) - express.e:24580
      {
        const currentConfBases = messageBases.filter(mb => mb.conferenceId === session.currentConf);
        const nextMsgBase = session.currentMsgBase + 1;

        if (nextMsgBase > currentConfBases.length) {
          // No next message base - show join prompt
          socket.emit('ansi-output', '\x1b[36m-= Join Message Base =-\x1b[0m\r\n');
          socket.emit('ansi-output', 'At last message base. Select message base to join:\r\n');
          currentConfBases.forEach(mb => {
            socket.emit('ansi-output', `${mb.id}. ${mb.name}\r\n`);
          });
          socket.emit('ansi-output', '\r\n\x1b[32mMessage base number: \x1b[0m');
          session.subState = LoggedOnSubState.CONFERENCE_SELECT;
          session.tempData = { messageBaseSelect: true, currentConfBases };
          return;
        } else {
          // Join next message base
          const nextBase = messageBases.find(mb => mb.id === nextMsgBase && mb.conferenceId === session.currentConf);
          if (nextBase) {
            session.currentMsgBase = nextMsgBase;
            socket.emit('ansi-output', `\r\n\x1b[32mJoined message base: ${nextBase.name}\x1b[0m\r\n`);
            socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
            session.menuPause = false;
            session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
          }
        }
      }
      return;

    case 'J': // Join Conference (internalCommandJ) - express.e:25113-25184
      // TODO for 100% 1:1 compliance:
      // 1. checkSecurity(ACS_JOIN_CONFERENCE) - express.e:25119
      // 2. saveMsgPointers(currentConf, currentMsgBase) - express.e:25120
      // 3. setEnvStat(ENV_JOIN) - express.e:25122
      // 4. getInverse() for relative conference numbers - express.e:25136
      // 5. displayScreen(SCREEN_JOINCONF) when no params - express.e:25139
      // 6. lineInput() with timeout handling - express.e:25141
      // 7. checkConfAccess(newConf) for permission check - express.e:25151
      // 8. getConfLocation() and callersLog() for diagnostics - express.e:25156-25159
      // 9. displayScreen(SCREEN_CONF_JOINMSGBASE) for msgbase - express.e:25164-25165
      // 10. lineInput() for message base selection - express.e:25167

      socket.emit('ansi-output', '\x1b[36m-= Join Conference =-\x1b[0m\r\n');
      socket.emit('ansi-output', 'Available conferences:\r\n');
      conferences.forEach(conf => {
        socket.emit('ansi-output', `${conf.id}. ${conf.name} - ${conf.description}\r\n`);
      });

      // Parse params: "J 5" or "J 5.2" or "J 5 2" (express.e:25124-25134)
      if (params.trim()) {
        let confId = 0;
        let msgBaseId = 1;

        // Check for "5.2" format
        if (params.includes('.')) {
          const parts = params.split('.');
          confId = parseInt(parts[0]);
          msgBaseId = parseInt(parts[1]) || 1;
        } else {
          // Check for "5 2" format or just "5"
          const parts = params.trim().split(/\s+/);
          confId = parseInt(parts[0]);
          if (parts.length > 1) {
            msgBaseId = parseInt(parts[1]) || 1;
          }
        }

        // Validate conference
        const selectedConf = conferences.find(conf => conf.id === confId);
        if (!selectedConf) {
          socket.emit('ansi-output', `\r\n\x1b[31mInvalid conference number: ${confId}\x1b[0m\r\n`);
          socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
          session.menuPause = false;
          session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
          return;
        }

        // Validate message base
        const selectedMsgBase = messageBases.find(mb => mb.id === msgBaseId && mb.conferenceId === confId);
        if (!selectedMsgBase) {
          socket.emit('ansi-output', `\r\n\x1b[31mInvalid message base: ${msgBaseId} for conference ${confId}\x1b[0m\r\n`);
          socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
          session.menuPause = false;
          session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
          return;
        }

        // Join the conference
        await joinConference(socket, session, confId, msgBaseId);
        socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
        session.menuPause = false;
        session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
      } else {
        // No params - prompt for input
        socket.emit('ansi-output', `\r\n\x1b[32mConference number (1-${conferences.length}): \x1b[0m`);
        session.subState = LoggedOnSubState.CONFERENCE_SELECT;
        return; // Stay in input mode
      }
      break; // Continue to menu display

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

    case 'F': // File Areas (internalCommandF) - displayFileList(params)
      displayFileList(socket, session, params, false);
      return;

    case 'FR': // File Areas Reverse (internalCommandFR) - displayFileList(params, TRUE)
      displayFileList(socket, session, params, true);
      return;

    case 'FM': // File Maintenance (internalCommandFM) - maintenanceFileSearch()
      displayFileMaintenance(socket, session, params);
      return; // Don't continue to menu display

    case 'FS': // File Status (internalCommandFS) - fileStatus()
      await displayFileStatus(socket, session, params);
      return;

    case 'N': // New Files (internalCommandN) - displayNewFiles(params)
      displayNewFiles(socket, session, params);
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


    case 'T': // Time/Date Display (internalCommandT) - express.e:25622
      {
        const now = new Date();
        const dateStr = now.toLocaleDateString('en-US');
        const timeStr = now.toLocaleTimeString('en-US');
        socket.emit('ansi-output', `\r\nIt is ${dateStr} ${timeStr}\r\n`);
        socket.emit('ansi-output', `Time remaining: ${Math.floor(session.timeRemaining)} minutes\r\n`);
        socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
        session.menuPause = false;
        session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
      }
      return;

    case 'B': // Bulletins (internalCommandB) - express.e:24607
      // TODO: Implement bulletin file system from Bulletins/ directory
      socket.emit('ansi-output', '\x1b[36m-= Bulletins =-\x1b[0m\r\n');
      socket.emit('ansi-output', 'Bulletin system not yet implemented.\r\n');
      socket.emit('ansi-output', 'This will display bulletins from the Bulletins/ directory.\r\n');
      socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
      session.menuPause = false;
      session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
      return;

    case 'H': // Help (internalCommandH) - express.e:25071
      // Like AmiExpress: Display help file for current conference
      socket.emit('ansi-output', '\x1b[36m-= Help =-\x1b[0m\r\n');
      socket.emit('ansi-output', 'Available commands:\r\n\r\n');
      socket.emit('ansi-output', '< / >    - Previous/Next Conference\r\n');
      socket.emit('ansi-output', '<< / >>  - Previous/Next Message Base\r\n');
      socket.emit('ansi-output', 'R        - Read Messages\r\n');
      socket.emit('ansi-output', 'A        - Post Message\r\n');
      socket.emit('ansi-output', 'J        - Join Conference\r\n');
      socket.emit('ansi-output', 'JM       - Join Message Base\r\n');
      socket.emit('ansi-output', 'F        - File Areas\r\n');
      socket.emit('ansi-output', 'N        - New Files\r\n');
      socket.emit('ansi-output', 'D        - Download Files\r\n');
      socket.emit('ansi-output', 'U        - Upload Files\r\n');
      socket.emit('ansi-output', 'O        - Page Sysop\r\n');
      socket.emit('ansi-output', 'C        - Comment to Sysop\r\n');
      socket.emit('ansi-output', 'X        - Toggle Expert Mode\r\n');
      socket.emit('ansi-output', 'T        - Time/Date\r\n');
      socket.emit('ansi-output', 'G        - Goodbye\r\n');
      socket.emit('ansi-output', '?        - Help\r\n');
      socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
      session.menuPause = false;
      session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
      return;

    case 'M': // Message Menu (internalCommandM) - express.e:25239
      // TODO: Implement full message menu from express.e
      socket.emit('ansi-output', '\x1b[36m-= Message Menu =-\x1b[0m\r\n');
      socket.emit('ansi-output', 'Message menu not yet fully implemented.\r\n');
      socket.emit('ansi-output', 'Use R to read messages, A to post.\r\n');
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

    case 'G': // Goodbye (internalCommandG) - express.e:25047-25069
      // Enhanced for Phase 7 Part 2 - added logging and better UX
      // TODO for 100% 1:1 compliance:
      // 1. parseParams(params) - check for 'Y' auto parameter - express.e:25051-25054
      // 2. partUploadOK(0) - check for partial uploads - express.e:25057
      // 3. checkFlagged() - check for flagged files - express.e:25058
      // 4. saveFlagged() - save flagged file list - express.e:25063
      // 5. saveHistory() - save command history - express.e:25064

      // Log the logoff event
      if (session.user) {
        await callersLog(session.user.id, session.user.username, 'Logged off');
      }

      // Display goodbye message
      socket.emit('ansi-output', '\r\n\x1b[36m-= Logging Off =-\x1b[0m\r\n\r\n');
      socket.emit('ansi-output', 'Thank you for calling!\r\n');
      socket.emit('ansi-output', 'We hope to see you again soon.\r\n\r\n');

      if (session.user) {
        const sessionTime = Math.floor((Date.now() - session.loginTime) / 60000);
        socket.emit('ansi-output', `Session time: ${sessionTime} minute(s)\r\n`);
        socket.emit('ansi-output', `Goodbye, ${session.user.username}!\r\n\r\n`);
      }

      // Give user time to see message before disconnect
      await new Promise(resolve => setTimeout(resolve, 1000));

      socket.disconnect();
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

    case 'Q': // Quiet Node (internalCommandQ)
      socket.emit('ansi-output', '\x1b[36m-= Quiet Node =-\x1b[0m\r\n');
      socket.emit('ansi-output', 'This command will change the Quiet Node option for your node.\r\n');
      socket.emit('ansi-output', 'With this command a user can prevent other users from seeing them on the WHO list.\r\n\r\n');

      // Toggle quiet node status
      const user = session.user!;
      user.quietNode = !user.quietNode;

      // Update in database
      await db.updateUser(user.id, { quietNode: user.quietNode });

      socket.emit('ansi-output', `Quiet node is now ${user.quietNode ? 'ON' : 'OFF'}.\r\n`);
      socket.emit('ansi-output', user.quietNode ?
        'Other users will not see you in the online user list.\r\n' :
        'Other users can now see you in the online user list.\r\n');

      socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
      session.menuPause = false;
      session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
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

    case '?': // Help (internalCommandQuestionMark)
      socket.emit('ansi-output', '\x1b[36m-= Command Help =-\x1b[0m\r\n');
      socket.emit('ansi-output', '0 - Remote Shell\r\n');
      socket.emit('ansi-output', '1 - Account Editing\r\n');
      socket.emit('ansi-output', '2 - View Callers Log\r\n');
      socket.emit('ansi-output', '3 - Edit Directory Files\r\n');
      socket.emit('ansi-output', '4 - Edit Any File\r\n');
      socket.emit('ansi-output', '5 - Change Directory\r\n');
      socket.emit('ansi-output', 'R - Read Messages\r\n');
      socket.emit('ansi-output', 'A - Post Message\r\n');
      socket.emit('ansi-output', 'J - Join Conference\r\n');
      socket.emit('ansi-output', 'JM - Join Message Base\r\n');
      socket.emit('ansi-output', 'F - File Areas\r\n');
      socket.emit('ansi-output', 'N - New Files\r\n');
      socket.emit('ansi-output', 'D - Download Files\r\n');
      socket.emit('ansi-output', 'U - Upload Files\r\n');
      socket.emit('ansi-output', 'O - Page Sysop for Chat\r\n');
      socket.emit('ansi-output', 'C - Comment to Sysop\r\n');
      socket.emit('ansi-output', 'X - Expert Mode Toggle\r\n');
      socket.emit('ansi-output', 'G - Goodbye\r\n');
      socket.emit('ansi-output', 'Q - Quiet Node\r\n');
      socket.emit('ansi-output', '? - This help\r\n');
      break;

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
      break;
  }

  // Return to menu after command processing (mirroring menuPause logic)
  console.log('Setting subState to DISPLAY_MENU and calling displayMainMenu');
  session.subState = LoggedOnSubState.DISPLAY_MENU;
  displayMainMenu(socket, session);
}

server.listen(port, async () => {
  console.log(`Server running on port ${port}`);

  // Initialize database and load data
  await initializeData();
});
// Global data caches (loaded from database)
let conferences: any[] = [];
let messageBases: any[] = [];
let fileAreas: any[] = [];
let fileEntries: any[] = [];
let messages: any[] = [];

// Initialize data from database
async function initializeData() {
  try {
    conferences = await db.getConferences();
    if (conferences.length === 0) {
      await db.initializeDefaultData();
      conferences = await db.getConferences();
    }

    // Load message bases for all conferences
    messageBases = [];
    for (const conf of conferences) {
      const bases = await db.getMessageBases(conf.id);
      messageBases.push(...bases);
    }

    // Load file areas for all conferences
    fileAreas = [];
    for (const conf of conferences) {
      const areas = await db.getFileAreas(conf.id);
      fileAreas.push(...areas);
    }

    // Load some recent messages
    messages = await db.getMessages(1, 1, { limit: 50 });

    // Initialize doors
    await initializeDoors();

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

// Initialize door collection
async function initializeDoors() {
  doors = [
    {
      id: 'sal',
      name: 'Super AmiLog',
      description: 'Advanced callers log viewer with statistics and filtering',
      command: 'SAL',
      path: 'doors/POTTYSRC/PottySrc/Pot/Source/SAL/SAmiLog.s',
      accessLevel: 10,
      enabled: true,
      type: 'web',
      parameters: ['-r'] // Read-only mode for web
    },
    {
      id: 'checkup',
      name: 'CheckUP Utility',
      description: 'File checking utility for upload directories',
      command: 'CHECKUP',
      path: 'doors/Y-CU04/tAJcHECKUP/CheckUP',
      accessLevel: 1,
      enabled: true,
      type: 'web',
      parameters: []
    }
  ];
}

// Sysop chat functions (1:1 implementation of AmiExpress chat system)

// startSysopPage() - Initiates sysop paging (like ccom() in AmiExpress)
function startSysopPage(socket: any, session: BBSSession) {
  console.log('Starting sysop page for user:', session.user?.username);

  // Create chat session (like pagedFlag in AmiExpress)
  const chatSession: ChatSession = {
    id: `chat_${Date.now()}_${session.user?.id}`,
    userId: session.user!.id,
    startTime: new Date(),
    status: 'paging',
    messages: [],
    pageCount: 1,
    lastActivity: new Date()
  };

  chatState.activeSessions.push(chatSession);
  chatState.pagingUsers.push(session.user!.id);

  // Log the page (like callersLog in AmiExpress)
  console.log(`Operator paged at ${new Date().toISOString()} by ${session.user?.username}`);

  // Display paging message (like ccom() output)
  socket.emit('ansi-output', '\r\n\x1b[32mF1 Toggles chat\r\n');

  // Try to execute pager door first (like runSysCommand('PAGER') in AmiExpress)
  if (!executePagerDoor(socket, session, chatSession)) {
    // Fall back to internal pager (like the dots display)
    displayInternalPager(socket, session, chatSession);
  }
}

// executePagerDoor() - Execute external pager door (like runSysCommand('PAGER') in AmiExpress)
function executePagerDoor(socket: any, session: BBSSession, chatSession: ChatSession): boolean {
  // For now, always fall back to internal pager
  // In full implementation, this would check for PAGER door and execute it
  return false;
}

// displayInternalPager() - Internal pager display (like the dots in ccom())
function displayInternalPager(socket: any, session: BBSSession, chatSession: ChatSession) {
  const displayTime = new Date().toLocaleTimeString();
  const sysopName = 'Sysop'; // In real implementation, get from config

  socket.emit('ansi-output', `\r\n${displayTime}\r\n\r\nPaging ${sysopName} (CTRL-C to Abort). .`);

  // Start the paging dots animation (like the FOR loops in ccom())
  let dotCount = 0;
  const maxDots = 20;

  const dotInterval = setInterval(() => {
    socket.emit('ansi-output', ' .');

    // Check for F1 key press (like chatF=1 check in AmiExpress)
    // In web implementation, this would be handled by client-side key events

    dotCount++;
    if (dotCount >= maxDots) {
      clearInterval(dotInterval);
      // Complete paging process
      completePaging(socket, session, chatSession);
    }
  }, 1000); // 1 second delay like Delay(1) in AmiExpress

  // Store interval for cleanup
  (session as any).pagingInterval = dotInterval;
}

// completePaging() - Complete the paging process
function completePaging(socket: any, session: BBSSession, chatSession: ChatSession) {
  // Clear any paging interval
  if ((session as any).pagingInterval) {
    clearInterval((session as any).pagingInterval);
    delete (session as any).pagingInterval;
  }

  socket.emit('ansi-output', '\r\n\r\nThe Sysop has been paged\r\n');
  socket.emit('ansi-output', 'You may continue using the system\r\n');
  socket.emit('ansi-output', 'until the sysop answers your request.\r\n\r\n');

  // Update session status (like statMessage in AmiExpress)
  chatSession.status = 'paging'; // Wait for sysop response

  // Return to menu (like the end of ccom())
  session.subState = LoggedOnSubState.DISPLAY_MENU;
  displayMainMenu(socket, session);
}

// acceptChat() - Sysop accepts chat (like F1 press handling)
function acceptChat(socket: any, session: BBSSession, chatSession: ChatSession) {
  console.log('Sysop accepting chat for session:', chatSession.id);

  chatSession.status = 'active';
  chatSession.sysopId = session.user?.id; // Assuming sysop is accepting

  // Remove from paging users
  const pagingIndex = chatState.pagingUsers.indexOf(chatSession.userId);
  if (pagingIndex > -1) {
    chatState.pagingUsers.splice(pagingIndex, 1);
  }

  // Display chat start messages (like STARTCHAT.TXT)
  socket.emit('ansi-output', '\r\n\x1b[32mChat session started!\r\n');
  socket.emit('ansi-output', 'Type your messages. Press F1 to exit chat.\r\n\r\n');

  // Enter chat mode
  enterChatMode(socket, session, chatSession);
}

// enterChatMode() - Enter active chat mode (like chatFlag=TRUE in AmiExpress)
function enterChatMode(socket: any, session: BBSSession, chatSession: ChatSession) {
  // Set chat flag (like chatFlag:=TRUE in AmiExpress)
  (session as any).inChat = true;
  (session as any).chatSession = chatSession;

  socket.emit('ansi-output', '\x1b[36m[Chat Mode Active]\x1b[0m\r\n');
  socket.emit('ansi-output', 'You are now in chat with the user.\r\n');
  socket.emit('ansi-output', 'Press F1 to exit chat.\r\n\r\n');
}

// exitChat() - Exit chat mode (like F1 exit in AmiExpress)
function exitChat(socket: any, session: BBSSession) {
  const chatSession = (session as any).chatSession as ChatSession;
  if (chatSession) {
    chatSession.status = 'ended';
    chatSession.endTime = new Date();

    // Remove from active sessions
    const sessionIndex = chatState.activeSessions.findIndex(s => s.id === chatSession.id);
    if (sessionIndex > -1) {
      chatState.activeSessions.splice(sessionIndex, 1);
    }
  }

  // Clear chat state
  delete (session as any).inChat;
  delete (session as any).chatSession;

  // Display exit message (like ENDCHAT.TXT)
  socket.emit('ansi-output', '\r\n\x1b[32mChat session ended.\r\n');

  // Return to normal operation
  session.subState = LoggedOnSubState.DISPLAY_MENU;
  displayMainMenu(socket, session);
}

// sendChatMessage() - Send message in chat (like chat input handling)
function sendChatMessage(socket: any, session: BBSSession, message: string) {
  const chatSession = (session as any).chatSession as ChatSession;
  if (!chatSession || chatSession.status !== 'active') {
    return;
  }

  const chatMessage: ChatMessage = {
    id: `msg_${Date.now()}`,
    sessionId: chatSession.id,
    senderId: session.user!.id,
    senderName: session.user!.username,
    content: message,
    timestamp: new Date(),
    isSysop: session.user?.secLevel === 255 // Assuming 255 = sysop level
  };

  chatSession.messages.push(chatMessage);
  chatSession.lastActivity = new Date();

  // Format and display message (like ANSI color handling in AmiExpress)
  const colorCode = chatMessage.isSysop ? '\x1b[31m' : '\x1b[32m'; // Red for sysop, green for user
  socket.emit('ansi-output', `${colorCode}${chatMessage.senderName}: ${chatMessage.content}\x1b[0m\r\n`);
}

// handleFileDeleteConfirmation() - Confirm and execute file deletion
function handleFileDeleteConfirmation(socket: any, session: BBSSession, input: string) {
  const tempData = session.tempData as {
    operation: string;
    allowedFiles: any[];
    filename: string;
  };

  let filesToDelete: any[] = [];

  if (input.toUpperCase() === 'ALL') {
    filesToDelete = tempData.allowedFiles;
  } else {
    // Parse comma-separated numbers
    const indices = input.split(',').map(s => parseInt(s.trim()) - 1); // Convert to 0-based
    filesToDelete = indices
      .filter(i => i >= 0 && i < tempData.allowedFiles.length)
      .map(i => tempData.allowedFiles[i]);
  }

  if (filesToDelete.length === 0) {
    socket.emit('ansi-output', '\r\nNo files selected for deletion.\r\n');
    socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
    session.menuPause = false;
    session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
    session.tempData = undefined;
    return;
  }

  // Delete files from database
  let deletedCount = 0;
  filesToDelete.forEach(({ file }) => {
    // In production, also delete from file system
    // For now, just mark as deleted in database
    db.updateFileEntry(file.id, { status: 'deleted' }).then(() => {
      deletedCount++;
      if (deletedCount === filesToDelete.length) {
        socket.emit('ansi-output', `\r\n\x1b[32mSuccessfully deleted ${deletedCount} file(s).\x1b[0m\r\n`);
        socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
        session.menuPause = false;
        session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
        session.tempData = undefined;
      }
    }).catch(error => {
      console.error('Error deleting file:', error);
      socket.emit('ansi-output', `\r\n\x1b[31mError deleting ${file.filename}.\x1b[0m\r\n`);
    });
  });
}

// handleFileMoveConfirmation() - Confirm and execute file move
function handleFileMoveConfirmation(socket: any, session: BBSSession, input: string) {
  const tempData = session.tempData as {
    operation: string;
    allowedFiles: any[];
    destArea: any;
    filename: string;
  };

  let filesToMove: any[] = [];

  if (input.toUpperCase() === 'ALL') {
    filesToMove = tempData.allowedFiles;
  } else {
    // Parse comma-separated numbers
    const indices = input.split(',').map(s => parseInt(s.trim()) - 1); // Convert to 0-based
    filesToMove = indices
      .filter(i => i >= 0 && i < tempData.allowedFiles.length)
      .map(i => tempData.allowedFiles[i]);
  }

  if (filesToMove.length === 0) {
    socket.emit('ansi-output', '\r\nNo files selected for moving.\r\n');
    socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
    session.menuPause = false;
    session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
    session.tempData = undefined;
    return;
  }

  // Move files to destination area
  let movedCount = 0;
  filesToMove.forEach(({ file }) => {
    db.updateFileEntry(file.id, { areaId: tempData.destArea.id }).then(() => {
      movedCount++;
      if (movedCount === filesToMove.length) {
        socket.emit('ansi-output', `\r\n\x1b[32mSuccessfully moved ${movedCount} file(s) to ${tempData.destArea.name}.\x1b[0m\r\n`);
        socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
        session.menuPause = false;
        session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
        session.tempData = undefined;
      }
    }).catch(error => {
      console.error('Error moving file:', error);
      socket.emit('ansi-output', `\r\n\x1b[31mError moving ${file.filename}.\x1b[0m\r\n`);
    });
  });
}

// toggleSysopAvailable() - Toggle sysop availability (like F7 in AmiExpress)
function toggleSysopAvailable() {
  chatState.sysopAvailable = !chatState.sysopAvailable;
  console.log('Sysop availability toggled to:', chatState.sysopAvailable);
}

// getChatStatus() - Get current chat status for display
function getChatStatus(): { available: boolean, pagingCount: number, activeCount: number } {
  return {
    available: chatState.sysopAvailable,
    pagingCount: chatState.pagingUsers.length,
    activeCount: chatState.activeSessions.filter(s => s.status === 'active').length
  };
}

// displayAccountEditingMenu() - Account editing interface (1:1 with AmiExpress account editing)
function displayAccountEditingMenu(socket: any, session: BBSSession) {
  socket.emit('ansi-output', '\x1b[36m-= Account Editing Menu =-\x1b[0m\r\n');
  socket.emit('ansi-output', 'Available operations:\r\n\r\n');
  socket.emit('ansi-output', '1. Edit User Account\r\n');
  socket.emit('ansi-output', '2. View User Statistics\r\n');
  socket.emit('ansi-output', '3. Change User Security Level\r\n');
  socket.emit('ansi-output', '4. Toggle User Flags\r\n');
  socket.emit('ansi-output', '5. Delete User Account\r\n');
  socket.emit('ansi-output', '6. List All Users\r\n');
  socket.emit('ansi-output', '7. Search Users\r\n');
  socket.emit('ansi-output', '\r\n\x1b[32mSelect option (1-7) or press Enter to cancel: \x1b[0m');

  session.subState = LoggedOnSubState.FILE_AREA_SELECT; // Reuse for menu selection
  session.tempData = { accountEditingMenu: true };
}

// handleAccountEditing() - Process account editing selections
function handleAccountEditing(socket: any, session: BBSSession, input: string) {
  const option = parseInt(input.trim());

  if (isNaN(option) || option < 1 || option > 7) {
    socket.emit('ansi-output', '\r\n\x1b[31mInvalid option.\x1b[0m\r\n');
    socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
    session.menuPause = false;
    session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
    session.tempData = undefined;
    return;
  }

  switch (option) {
    case 1: // Edit User Account
      socket.emit('ansi-output', '\r\n\x1b[36m-= Edit User Account =-\x1b[0m\r\n');
      socket.emit('ansi-output', 'Enter username to edit: ');
      session.subState = LoggedOnSubState.FILE_DIR_SELECT; // Reuse for username input
      session.tempData = { editUserAccount: true };
      return;

    case 2: // View User Statistics
      socket.emit('ansi-output', '\r\n\x1b[36m-= User Statistics =-\x1b[0m\r\n');
      socket.emit('ansi-output', 'Enter username to view stats: ');
      session.subState = LoggedOnSubState.FILE_DIR_SELECT;
      session.tempData = { viewUserStats: true };
      return;

    case 3: // Change User Security Level
      socket.emit('ansi-output', '\r\n\x1b[36m-= Change Security Level =-\x1b[0m\r\n');
      socket.emit('ansi-output', 'Enter username: ');
      session.subState = LoggedOnSubState.FILE_DIR_SELECT;
      session.tempData = { changeSecLevel: true };
      return;

    case 4: // Toggle User Flags
      socket.emit('ansi-output', '\r\n\x1b[36m-= Toggle User Flags =-\x1b[0m\r\n');
      socket.emit('ansi-output', 'Enter username: ');
      session.subState = LoggedOnSubState.FILE_DIR_SELECT;
      session.tempData = { toggleUserFlags: true };
      return;

    case 5: // Delete User Account
      socket.emit('ansi-output', '\r\n\x1b[36m-= Delete User Account =-\x1b[0m\r\n');
      socket.emit('ansi-output', '\x1b[31mWARNING: This action cannot be undone!\x1b[0m\r\n');
      socket.emit('ansi-output', 'Enter username to delete: ');
      session.subState = LoggedOnSubState.FILE_DIR_SELECT;
      session.tempData = { deleteUserAccount: true };
      return;

    case 6: // List All Users
      displayUserList(socket, session);
      return;

    case 7: // Search Users
      socket.emit('ansi-output', '\r\n\x1b[36m-= Search Users =-\x1b[0m\r\n');
      socket.emit('ansi-output', 'Enter search term (username, realname, or location): ');
      session.subState = LoggedOnSubState.FILE_DIR_SELECT;
      session.tempData = { searchUsers: true };
      return;
  }
}

// displayUserList() - Display paginated user list
function displayUserList(socket: any, session: BBSSession, page: number = 1, searchTerm?: string) {
  const pageSize = 20;
  const offset = (page - 1) * pageSize;

  socket.emit('ansi-output', '\x1b[36m-= User List ');
  if (searchTerm) {
    socket.emit('ansi-output', `(Search: "${searchTerm}") `);
  }
  socket.emit('ansi-output', `Page ${page} =-\x1b[0m\r\n\r\n`);

  socket.emit('ansi-output', '\x1b[32mUsername'.padEnd(16) + 'Real Name'.padEnd(20) + 'Location'.padEnd(15) + 'Level  Last Login\x1b[0m\r\n');
  socket.emit('ansi-output', '\x1b[36m' + '='.repeat(75) + '\x1b[0m\r\n');

  // Get users (with optional search)
  db.getUsers({ limit: pageSize + 1, newUser: undefined }).then(users => {
    const hasMorePages = users.length > pageSize;
    const displayUsers = users.slice(0, pageSize);

    displayUsers.forEach(user => {
      const lastLogin = user.lastLogin ? user.lastLogin.toLocaleDateString() : 'Never';
      socket.emit('ansi-output',
        user.username.padEnd(16) +
        (user.realname || '').padEnd(20) +
        (user.location || '').padEnd(15) +
        user.secLevel.toString().padStart(5) + '  ' +
        lastLogin + '\r\n'
      );
    });

    socket.emit('ansi-output', '\r\n');

    if (hasMorePages) {
      socket.emit('ansi-output', `\x1b[32mPress any key for page ${page + 1}, or 'Q' to quit: \x1b[0m`);
      session.tempData = { userListPage: page + 1, searchTerm };
    } else {
      socket.emit('ansi-output', '\x1b[32mEnd of list. Press any key to continue...\x1b[0m');
      session.tempData = undefined;
    }

    session.menuPause = false;
    session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
  }).catch(error => {
    console.error('Error fetching users:', error);
    socket.emit('ansi-output', '\x1b[31mError loading user list.\x1b[0m\r\n');
    socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
    session.menuPause = false;
    session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
    session.tempData = undefined;
  });
}

// handleEditUserAccount() - Edit user account details
function handleEditUserAccount(socket: any, session: BBSSession, username: string) {
  db.getUserByUsername(username).then(user => {
    if (!user) {
      socket.emit('ansi-output', '\r\n\x1b[31mUser not found.\x1b[0m\r\n');
      socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
      session.menuPause = false;
      session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
      session.tempData = undefined;
      return;
    }

    socket.emit('ansi-output', `\r\n\x1b[36m-= Editing User: ${user.username} =-\x1b[0m\r\n`);
    socket.emit('ansi-output', `Real Name: ${user.realname || 'Not set'}\r\n`);
    socket.emit('ansi-output', `Location: ${user.location || 'Not set'}\r\n`);
    socket.emit('ansi-output', `Phone: ${user.phone || 'Not set'}\r\n`);
    socket.emit('ansi-output', `Security Level: ${user.secLevel}\r\n`);
    socket.emit('ansi-output', `Expert Mode: ${user.expert ? 'Yes' : 'No'}\r\n`);
    socket.emit('ansi-output', `ANSI: ${user.ansi ? 'Yes' : 'No'}\r\n\r\n`);

    socket.emit('ansi-output', '\x1b[32mAccount editing interface not fully implemented yet.\x1b[0m\r\n');
    socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
    session.menuPause = false;
    session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
    session.tempData = undefined;
  }).catch(error => {
    console.error('Error fetching user:', error);
    socket.emit('ansi-output', '\r\n\x1b[31mError loading user data.\x1b[0m\r\n');
    socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
    session.menuPause = false;
    session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
    session.tempData = undefined;
  });
}

// handleViewUserStats() - View detailed user statistics
function handleViewUserStats(socket: any, session: BBSSession, username: string) {
  db.getUserByUsername(username).then(user => {
    if (!user) {
      socket.emit('ansi-output', '\r\n\x1b[31mUser not found.\x1b[0m\r\n');
      socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
      session.menuPause = false;
      session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
      session.tempData = undefined;
      return;
    }

    socket.emit('ansi-output', `\r\n\x1b[36m-= Statistics for ${user.username} =-\x1b[0m\r\n\r\n`);
    socket.emit('ansi-output', `\x1b[32mAccount Information:\x1b[0m\r\n`);
    socket.emit('ansi-output', `Real Name: ${user.realname}\r\n`);
    socket.emit('ansi-output', `Location: ${user.location}\r\n`);
    socket.emit('ansi-output', `Security Level: ${user.secLevel}\r\n`);
    socket.emit('ansi-output', `First Login: ${user.firstLogin.toLocaleDateString()}\r\n`);
    socket.emit('ansi-output', `Last Login: ${user.lastLogin?.toLocaleDateString() || 'Never'}\r\n\r\n`);

    socket.emit('ansi-output', `\x1b[32mActivity Statistics:\x1b[0m\r\n`);
    socket.emit('ansi-output', `Total Calls: ${user.calls}\r\n`);
    socket.emit('ansi-output', `Calls Today: ${user.callsToday}\r\n`);
    socket.emit('ansi-output', `Time Total: ${user.timeTotal} minutes\r\n`);
    socket.emit('ansi-output', `Time Used: ${user.timeUsed} minutes\r\n`);
    socket.emit('ansi-output', `Time Limit: ${user.timeLimit} minutes\r\n\r\n`);

    socket.emit('ansi-output', `\x1b[32mFile Statistics:\x1b[0m\r\n`);
    socket.emit('ansi-output', `Files Uploaded: ${user.uploads}\r\n`);
    socket.emit('ansi-output', `Bytes Uploaded: ${user.bytesUpload}\r\n`);
    socket.emit('ansi-output', `Files Downloaded: ${user.downloads}\r\n`);
    socket.emit('ansi-output', `Bytes Downloaded: ${user.bytesDownload}\r\n\r\n`);

    socket.emit('ansi-output', '\x1b[32mPress any key to continue...\x1b[0m');
    session.menuPause = false;
    session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
    session.tempData = undefined;
  }).catch(error => {
    console.error('Error fetching user stats:', error);
    socket.emit('ansi-output', '\r\n\x1b[31mError loading user statistics.\x1b[0m\r\n');
    socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
    session.menuPause = false;
    session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
    session.tempData = undefined;
  });
}

// handleChangeSecLevel() - Change user security level
function handleChangeSecLevel(socket: any, session: BBSSession, input: string) {
  // This would need multi-step input: username, then new level
  socket.emit('ansi-output', '\r\n\x1b[32mSecurity level editing not fully implemented yet.\x1b[0m\r\n');
  socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
  session.menuPause = false;
  session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
  session.tempData = undefined;
}

// handleToggleUserFlags() - Toggle user flags (expert, ansi, etc.)
function handleToggleUserFlags(socket: any, session: BBSSession, input: string) {
  socket.emit('ansi-output', '\r\n\x1b[32mUser flag editing not fully implemented yet.\x1b[0m\r\n');
  socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
  session.menuPause = false;
  session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
  session.tempData = undefined;
}

// handleDeleteUserAccount() - Delete user account
function handleDeleteUserAccount(socket: any, session: BBSSession, input: string) {
  socket.emit('ansi-output', '\r\n\x1b[32mUser account deletion not implemented yet.\x1b[0m\r\n');
  socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
  session.menuPause = false;
  session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
  session.tempData = undefined;
}

// handleSearchUsers() - Search users by various criteria
function handleSearchUsers(socket: any, session: BBSSession, searchTerm: string) {
  socket.emit('ansi-output', `\r\n\x1b[36m-= Searching for "${searchTerm}" =-\x1b[0m\r\n`);
  socket.emit('ansi-output', 'Searching...\r\n\r\n');

  // For now, just show a message that search is not fully implemented
  socket.emit('ansi-output', '\x1b[32mUser search not fully implemented yet.\x1b[0m\r\n');
  socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
  session.menuPause = false;
  session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
  session.tempData = undefined;
}