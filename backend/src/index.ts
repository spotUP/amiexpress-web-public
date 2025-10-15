// Import and initialize migrations system
// import { migrationManager } from './migrations';

// Run pending migrations on startup (for production deployments)
// if (process.env.NODE_ENV === 'production') {
//   console.log('🔄 Checking for pending database migrations...');
//   migrationManager.migrate().then(result => {
//     if (result.executed.length > 0) {
//       console.log(`✅ Applied ${result.executed.length} database migrations`);
//     } else {
//       console.log('✅ No pending migrations');
//     }
//     if (result.failed.length > 0) {
//       console.error(`❌ Failed to apply ${result.failed.length} migrations:`, result.failed);
//     }
//   }).catch(error => {
//     console.error('❌ Migration error:', error);
//     // Don't exit in production - continue with existing schema
//   });
// }

import express, { Request, Response } from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import { User, Door, DoorSession, ChatSession, ChatMessage, ChatState } from './types';
import { db } from './database';

// BBS State definitions (mirroring AmiExpress state machine)
enum BBSState {
  AWAIT = 'await',
  LOGON = 'logon',
  LOGGEDON = 'loggedon'
}

enum LoggedOnSubState {
  DISPLAY_BULL = 'display_bull',
  DISPLAY_CONF_BULL = 'display_conf_bull',
  DISPLAY_MENU = 'display_menu',
  READ_COMMAND = 'read_command',
  READ_SHORTCUTS = 'read_shortcuts',
  PROCESS_COMMAND = 'process_command',
  POST_MESSAGE_SUBJECT = 'post_message_subject',
  POST_MESSAGE_BODY = 'post_message_body',
  FILE_AREA_SELECT = 'file_area_select',
  FILE_DIR_SELECT = 'file_dir_select',
  FILE_LIST = 'file_list',
  FILE_LIST_CONTINUE = 'file_list_continue',
  CONFERENCE_SELECT = 'conference_select'
}

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
  menuPause: boolean; // Like AmiExpress menuPause - controls if menu displays immediately
  messageSubject?: string; // For message posting workflow
  messageBody?: string; // For message posting workflow
  messageRecipient?: string; // For private message recipient
  inputBuffer: string; // Buffer for line-based input (like login system)
  relConfNum: number; // Relative conference number (like AmiExpress relConfNum)
  currentConfName: string; // Current conference name (like AmiExpress currentConfName)
  cmdShortcuts: boolean; // Like AmiExpress cmdShortcuts - controls hotkey vs line input mode
  tempData?: any; // Temporary data storage for complex operations (like file listing)
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

// Import and use health check router
// import healthRouter from './health';
// app.use('/health', healthRouter);

// Configure CORS for Render.com deployment
const corsOptions = {
  origin: function (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
    // Allow requests from localhost (development) and Render.com deployments
    const allowedOrigins = [
      "http://localhost:5173",
      "http://localhost:3000",
      "http://localhost:3001",
      /^https:\/\/amiexpress.*\.onrender\.com$/,
      /^https:\/\/amiexpress.*\.vercel\.app$/,
      "https://amiexpress-web.vercel.app",
      "https://amiexpress-hqq1ycqoz-johans-projects-458502e2.vercel.app",
      "https://amiexpress-f16ckm2tw-johans-projects-458502e2.vercel.app"
    ];

    // Allow requests with no origin (mobile apps, curl requests, etc.)
    if (!origin) return callback(null, true);

    const isAllowed = allowedOrigins.some(pattern => {
      if (typeof pattern === 'string') {
        return pattern === origin;
      } else {
        return pattern.test(origin);
      }
    });

    if (isAllowed) {
      callback(null, true);
    } else {
      console.log('CORS blocked origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ["GET", "POST", "OPTIONS"],
  credentials: true,
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"]
};

app.use(cors(corsOptions));

// Add health check endpoint for Vercel monitoring
app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    connections: io.sockets.sockets.size,
    environment: process.env.NODE_ENV || 'development'
  });
});

// Create HTTP server
const server = createServer(app);

// Configure Socket.IO for Vercel
const io = new Server(server, {
  cors: corsOptions,
  transports: ['polling', 'websocket'],
  allowEIO3: true, // Allow Engine.IO v3 clients
  pingTimeout: 60000, // 60 seconds
  pingInterval: 25000, // 25 seconds
  connectTimeout: 20000, // 20 seconds
  maxHttpBufferSize: 1e8, // 100MB for file uploads
  cookie: false, // Disable cookies for better compatibility
  allowRequest: (req: any, callback: (err: string | null, success: boolean) => void) => {
    // Additional security check for Vercel
    const origin = req.headers.origin;
    if (origin && corsOptions.origin(origin, () => {}) !== null) {
      callback(null, true);
    } else {
      callback('CORS error', false);
    }
  }
});

// Add connection logging for Vercel debugging
io.on('connection', (socket: Socket) => {
  console.log(`🔌 Socket connected: ${socket.id} from ${socket.handshake.address}`);

  socket.on('disconnect', (reason: string) => {
    console.log(`🔌 Socket disconnected: ${socket.id}, reason: ${reason}`);
  });

  socket.on('error', (error: Error) => {
    console.error(`❌ Socket error for ${socket.id}:`, error);
  });
});

const port = process.env.PORT || 3001;

// Export for Vercel deployment
export default app;
export { io, server };

// Store active sessions (in production, use Redis/database)
const sessions = new Map<string, BBSSession>();

// Remove duplicate health check endpoint

app.use(cors({
    origin: function (origin, callback) {
      // Allow requests from localhost (development) and Vercel deployments
      const allowedOrigins = [
        "http://localhost:5173",
        "http://localhost:3000",
        /\.vercel\.app$/,
        "https://amiexpress-web.vercel.app",
        "https://amiexpress-owu55bmie-johans-projects-458502e2.vercel.app",
        "https://amiexpress-f16ckm2tw-johans-projects-458502e2.vercel.app"
      ];

      // Allow requests with no origin (mobile apps, etc.)
      if (!origin) return callback(null, true);

      const isAllowed = allowedOrigins.some(pattern => {
        if (typeof pattern === 'string') {
          return pattern === origin;
        } else {
          return pattern.test(origin);
        }
      });

      if (isAllowed) {
        callback(null, true);
      } else {
        console.log('CORS blocked origin:', origin);
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true
  }));
app.use(express.json());

app.get('/', (req: Request, res: Response) => {
  res.json({ message: 'AmiExpress Backend API' });
});

// Example route using User type
app.get('/users/:id', (req: Request, res: Response) => {
  const userId = req.params.id;
  // Placeholder: In a real app, fetch from DB
  const user: User = {
    id: userId,
    username: 'example',
    useRealName: true,
    realname: 'Example User'
  };
  res.json(user);
});

// BBS connection handler (separate from global Socket.IO logging)
io.on('connection', (socket: Socket) => {
  console.log('🎮 BBS Client connected from:', socket.handshake.address || 'unknown');

  // Initialize session (mirroring processAwait in AmiExpress)
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
    cmdShortcuts: false // Like AmiExpress - default to line input mode, not hotkeys
  };
  sessions.set(socket.id, session);

  // Handle connection errors gracefully
  socket.on('error', (error: Error) => {
    console.error('❌ BBS Socket error for client:', socket.id, error);
  });

  socket.on('connect_error', (error: Error) => {
    console.error('❌ BBS Connection error for client:', socket.id, error);
  });

  socket.on('login', async (data: { username: string; password: string }) => {
    console.log('Login attempt:', data.username);

    try {
      // Validate input
      if (!data.username || !data.password) {
        socket.emit('login-failed', 'Username and password are required');
        return;
      }

      // Authenticate user against database
      const user = await db.getUserByUsername(data.username);
      if (!user) {
        console.log('User not found:', data.username);
        socket.emit('login-failed', 'User not found');
        return;
      }

      // Verify password
      const isValidPassword = await db.verifyPassword(data.password, user.passwordHash);
      if (!isValidPassword) {
        console.log('Invalid password for user:', data.username);
        socket.emit('login-failed', 'Invalid password');
        return;
      }

      // Update last login
      await db.updateUser(user.id, { lastLogin: new Date(), calls: user.calls + 1, callsToday: user.callsToday + 1 });

      // Set session user data
      session.state = BBSState.LOGGEDON;
      session.subState = LoggedOnSubState.DISPLAY_BULL;
      session.user = user;

      // Set user preferences
      session.confRJoin = user.autoRejoin || 1;
      session.msgBaseRJoin = 1; // Default message base
      session.cmdShortcuts = !user.expert; // Expert mode uses shortcuts

      console.log('Login successful for user:', data.username);
      socket.emit('login-success');

      // Start the proper AmiExpress flow: bulletins first
      displaySystemBulletins(socket, session);
    } catch (error) {
      console.error('Login error:', error);
      socket.emit('login-failed', 'Internal server error');
    }
  });

  socket.on('register', async (data: { username: string; realname: string; location: string; password: string }) => {
    console.log('Registration attempt:', data.username);

    try {
      // Validate input
      if (!data.username || !data.password || !data.realname) {
        socket.emit('register-failed', 'Username, password, and real name are required');
        return;
      }

      // Validate username format
      if (data.username.length < 2 || data.username.length > 20) {
        socket.emit('register-failed', 'Username must be between 2 and 20 characters');
        return;
      }

      // Check if user already exists
      const existingUser = await db.getUserByUsername(data.username);
      if (existingUser) {
        console.log('Username already exists:', data.username);
        socket.emit('register-failed', 'Username already exists');
        return;
      }

      // Hash password
      const passwordHash = await db.hashPassword(data.password);

      // Create new user
      const userId = await db.createUser({
        username: data.username,
        passwordHash,
        realname: data.realname,
        location: data.location,
        phone: '',
        secLevel: 10, // Default security level
        uploads: 0,
        downloads: 0,
        bytesUpload: 0,
        bytesDownload: 0,
        ratio: 0,
        ratioType: 0,
        timeTotal: 0,
        timeLimit: 60, // 60 minutes default
        timeUsed: 0,
        chatLimit: 0,
        chatUsed: 0,
        firstLogin: new Date(),
        calls: 1,
        callsToday: 1,
        newUser: true,
        expert: false,
        ansi: true,
        linesPerScreen: 23,
        computer: 'Unknown',
        screenType: 'Amiga Ansi',
        protocol: '/X Zmodem',
        editor: 'Prompt',
        zoomType: 'QWK',
        availableForChat: true,
        quietNode: false,
        autoRejoin: 1,
        confAccess: 'XXX', // Access to first 3 conferences
        areaName: 'Standard',
        uuCP: false,
        topUploadCPS: 0,
        topDownloadCPS: 0,
        byteLimit: 0
      });

      // Get the created user
      const user = await db.getUserById(userId);
      if (!user) {
        console.error('Failed to retrieve created user:', userId);
        socket.emit('register-failed', 'Registration failed - user not created');
        return;
      }

      // Set session data
      session.state = BBSState.LOGGEDON;
      session.subState = LoggedOnSubState.DISPLAY_BULL;
      session.user = user;

      // Set user preferences
      session.confRJoin = user.autoRejoin || 1;
      session.msgBaseRJoin = 1;
      session.cmdShortcuts = !user.expert;

      console.log('Registration successful for user:', data.username);
      socket.emit('register-success');

      // Start the proper AmiExpress flow: bulletins first
      displaySystemBulletins(socket, session);
    } catch (error) {
      console.error('Registration error:', error);
      socket.emit('register-failed', 'Registration failed - internal server error');
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

  socket.on('disconnect', (reason: string) => {
    console.log('🎮 BBS Client disconnected:', socket.id, 'reason:', reason);
    sessions.delete(socket.id);
  });
});

// Display system bulletins (SCREEN_BULL equivalent)
function displaySystemBulletins(socket: any, session: BBSSession) {
  // In AmiExpress, displayScreen(SCREEN_BULL) shows system bulletins
  socket.emit('ansi-output', '\r\n\x1b[36m-= System Bulletins =-\x1b[0m\r\n');
  socket.emit('ansi-output', '\x1b[33mWelcome to AmiExpress Web!\x1b[0m\r\n');
  socket.emit('ansi-output', 'This is a modern web implementation of the classic AmiExpress BBS.\r\n');
  socket.emit('ansi-output', '\r\n\x1b[32mSystem News:\x1b[0m\r\n');
  socket.emit('ansi-output', '- New web interface available\r\n');
  socket.emit('ansi-output', '- Enhanced security features\r\n');
  socket.emit('ansi-output', '- Real-time chat capabilities\r\n');
  socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');

  // Move to next state after bulletin display (mirroring doPause logic)
  session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
}

// Display conference bulletins and trigger conference scan (SCREEN_NODE_BULL + confScan equivalent)
function displayConferenceBulletins(socket: any, session: BBSSession) {
  // In AmiExpress, displayScreen(SCREEN_NODE_BULL) shows node-specific bulletins
  socket.emit('ansi-output', '\r\n\x1b[36m-= Node Bulletins =-\x1b[0m\r\n');
  socket.emit('ansi-output', '\x1b[33mNode-specific announcements:\x1b[0m\r\n');
  socket.emit('ansi-output', '- Welcome to Node 1\r\n');
  socket.emit('ansi-output', '- All systems operational\r\n');
  socket.emit('ansi-output', '- Sysop available for chat\r\n');

  // Conference scan (confScan equivalent)
  socket.emit('ansi-output', '\r\n\x1b[32mScanning conferences for new messages...\x1b[0m\r\n');

  // Simulate conference scan results
  socket.emit('ansi-output', '\x1b[32mFound new messages in:\x1b[0m\r\n');
  socket.emit('ansi-output', '- General conference (5 new)\r\n');
  socket.emit('ansi-output', '- Tech Support conference (2 new)\r\n');

  socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');

  // Join default conference (joinConf equivalent)
  joinConference(socket, session, session.confRJoin, session.msgBaseRJoin);
}

// Join conference function (joinConf equivalent)
function joinConference(socket: any, session: BBSSession, confId: number, msgBaseId: number) {
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

  // Add safety check to prevent infinite loops
  let iterations = 0;
  const maxIterations = fileAreas.length * 2; // Reasonable upper bound

  while (((reverse && currentDir >= endDir) || (!reverse && currentDir <= endDir)) && iterations < maxIterations) {
    const areaIndex = currentDir - 1; // Convert to 0-based array index

    // Additional bounds checking
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
    iterations++;
  }

  // Log if we hit the safety limit (indicates potential logic error)
  if (iterations >= maxIterations) {
    console.warn('displaySelectedFileAreas: Hit safety limit, possible infinite loop prevented');
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
    socket.emit('ansi-output', 'Delete files functionality.\r\n');
    socket.emit('ansi-output', 'Enter filename to delete (wildcards supported):\r\n');
    socket.emit('ansi-output', '\r\nNot fully implemented yet.\r\n');
  } else if (operation === 'M') {
    // Move files
    socket.emit('ansi-output', 'Move files functionality.\r\n');
    socket.emit('ansi-output', 'Enter filename to move and destination area:\r\n');
    socket.emit('ansi-output', '\r\nNot fully implemented yet.\r\n');
  } else if (operation === 'S') {
    // Search files
    socket.emit('ansi-output', 'Search files functionality.\r\n');
    socket.emit('ansi-output', 'Enter search pattern:\r\n');
    socket.emit('ansi-output', '\r\nNot fully implemented yet.\r\n');
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
function displayFileStatus(socket: any, session: BBSSession, params: string) {
  socket.emit('ansi-output', '\x1b[36m-= File Status =-\x1b[0m\r\n');

  // Parse parameters to determine scope (like fileStatus(opt) in AmiExpress)
  const parsedParams = parseParams(params);
  const showAllConferences = parsedParams.length === 0 || parsedParams.includes('ALL');

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
    const bytesAvail = 1000000; // Mock available bytes
    const ratio = '1:1'; // Mock ratio

    const displayNum = showAllConferences ? conf.id : 1; // Relative numbering
    const highlight = conf.id === session.currentConf ? '\x1b[33m' : '\x1b[36m';

    socket.emit('ansi-output', `${highlight}    ${displayNum.toString().padStart(4)}  ${uploads.toString().padStart(7)}  ${Math.ceil(uploadBytes/1024).toString().padStart(14)} ${downloads.toString().padStart(7)}  ${Math.ceil(downloadBytes/1024).toString().padStart(14)}   ${bytesAvail.toString().padStart(9)}  ${ratio}\x1b[0m\r\n`);
  });

  // Display user-specific file statistics (like AmiExpress user file stats)
  const user = session.user!;
  socket.emit('ansi-output', '\r\n\x1b[32mYour File Statistics:\x1b[0m\r\n');
  socket.emit('ansi-output', `Files Uploaded: ${user.uploads || 0}\r\n`);
  socket.emit('ansi-output', `Bytes Uploaded: ${user.bytesUpload || 0}\r\n`);
  socket.emit('ansi-output', `Files Downloaded: ${user.downloads || 0}\r\n`);
  socket.emit('ansi-output', `Bytes Downloaded: ${user.bytesDownload || 0}\r\n`);

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

  // Add safety check to prevent infinite loops
  let iterations = 0;
  const maxIterations = fileAreas.length * 2; // Reasonable upper bound

  while (currentDir <= endDir && iterations < maxIterations) {
    const areaIndex = currentDir - 1; // Convert to 0-based array index

    // Additional bounds checking
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
    iterations++;
  }

  // Log if we hit the safety limit (indicates potential logic error)
  if (iterations >= maxIterations) {
    console.warn('displayNewFilesInDirectories: Hit safety limit, possible infinite loop prevented');
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
function executeDoor(socket: any, session: BBSSession, door: Door) {
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

  // Execute based on door type
  switch (door.type) {
    case 'web':
      executeWebDoor(socket, session, door, doorSession);
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
function executeWebDoor(socket: any, session: BBSSession, door: Door, doorSession: DoorSession) {
  switch (door.id) {
    case 'sal':
      executeSAmiLogDoor(socket, session, door, doorSession);
      break;
    case 'checkup':
      executeCheckUPDoor(socket, session, door, doorSession);
      break;
    default:
      socket.emit('ansi-output', 'Door implementation not found.\r\n');
  }
}

// Execute SAmiLog callers log viewer door
function executeSAmiLogDoor(socket: any, session: BBSSession, door: Door, doorSession: DoorSession) {
  socket.emit('ansi-output', '\x1b[36m-= Super AmiLog v3.00 =-\x1b[0m\r\n');
  socket.emit('ansi-output', 'Advanced Callers Log Viewer\r\n\r\n');

  // Simulate callers log display (would read from BBS:NODE{x}/CALLERSLOG)
  socket.emit('ansi-output', 'Recent callers:\r\n\r\n');

  // Mock some caller entries
  const mockCallers = [
    { user: 'ByteMaster', action: 'Logged off', time: '22:15:30' },
    { user: 'AmigaFan', action: 'Downloaded file', time: '22:10:15' },
    { user: 'RetroUser', action: 'Posted message', time: '22:05:42' },
    { user: 'NewUser', action: 'Logged on', time: '21:58:12' }
  ];

  mockCallers.forEach(caller => {
    socket.emit('ansi-output', `${caller.time} ${caller.user.padEnd(15)} ${caller.action}\r\n`);
  });

  socket.emit('ansi-output', '\r\n\x1b[32mPress any key to exit SAmiLog...\x1b[0m');
  session.menuPause = false;
  session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
}

// Execute CheckUP file checking utility
function executeCheckUPDoor(socket: any, session: BBSSession, door: Door, doorSession: DoorSession) {
  socket.emit('ansi-output', '\x1b[36m-= CheckUP v0.4 =-\x1b[0m\r\n');
  socket.emit('ansi-output', 'File checking utility for upload directories\r\n\r\n');

  // Check upload directory for files
  socket.emit('ansi-output', 'Checking upload directory...\r\n');

  // Simulate checking upload directory
  const hasFiles = Math.random() > 0.5; // Random for demo

  if (hasFiles) {
    socket.emit('ansi-output', 'Files found in upload directory!\r\n');
    socket.emit('ansi-output', 'Processing uploads...\r\n');
    socket.emit('ansi-output', '- File1.lha: Archive OK\r\n');
    socket.emit('ansi-output', '- File2.zip: Archive OK\r\n');
    socket.emit('ansi-output', 'Moving files to download area...\r\n');
  } else {
    socket.emit('ansi-output', 'No files found in upload directory.\r\n');
    socket.emit('ansi-output', 'Running cleanup scripts...\r\n');
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

  // Display file areas for upload
  socket.emit('ansi-output', '\x1b[32mAvailable File Areas:\x1b[0m\r\n');
  const currentFileAreas = fileAreas.filter(area => area.conferenceId === session.currentConf);
  currentFileAreas.forEach((area, index) => {
    socket.emit('ansi-output', `${index + 1}. ${area.name} - ${area.description}\r\n`);
  });

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

  // Display current protocol (simplified)
  socket.emit('ansi-output', '\x1b[32mCurrent Transfer Protocol:\x1b[0m WebSocket\r\n\r\n');

  // Prompt for file selection (WebSocket-based upload)
  socket.emit('ansi-output', '\x1b[32mSelect files to upload (WebSocket-based):\x1b[0m\r\n');
  socket.emit('ansi-output', 'Upload functionality will be implemented with WebSocket chunking.\r\n');
  socket.emit('ansi-output', 'This will support resumable uploads and progress tracking.\r\n\r\n');

  // For now, show placeholder message
  socket.emit('ansi-output', '\x1b[33mUpload system under development...\x1b[0m\r\n');
  socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
  session.menuPause = false;
  session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
  session.tempData = undefined;
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

  // Display current protocol (simplified)
  socket.emit('ansi-output', '\x1b[32mCurrent Transfer Protocol:\x1b[0m WebSocket\r\n\r\n');

  // Display file areas for download
  socket.emit('ansi-output', '\x1b[32mAvailable File Areas:\x1b[0m\r\n');
  const currentFileAreas = fileAreas.filter(area => area.conferenceId === session.currentConf);
  currentFileAreas.forEach((area, index) => {
    socket.emit('ansi-output', `${index + 1}. ${area.name} - ${area.description}\r\n`);
  });

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

// Display main menu (SCREEN_MENU equivalent)
function displayMainMenu(socket: any, session: BBSSession) {
  console.log('displayMainMenu called, current subState:', session.subState, 'menuPause:', session.menuPause);

  // Like AmiExpress: only display menu if menuPause is TRUE
  if (session.menuPause) {
    console.log('menuPause is TRUE, displaying menu');

    // Clear screen before displaying menu (like AmiExpress does)
    console.log('Sending screen clear: \\x1b[2J\\x1b[H');
    socket.emit('ansi-output', '\x1b[2J\x1b[H'); // Clear screen and move cursor to top

    if (session.user?.expert !== "N") {
      console.log('Sending menu header');
      socket.emit('ansi-output', '\x1b[36m-= Main Menu =-\x1b[0m\r\n');
      socket.emit('ansi-output', 'Available commands:\r\n');
      socket.emit('ansi-output', 'R) Read Messages\r\n');
      socket.emit('ansi-output', 'A) Post Message\r\n');
      socket.emit('ansi-output', 'J) Join Conference\r\n');
      socket.emit('ansi-output', 'F) File Areas\r\n');
      socket.emit('ansi-output', 'D) Download Files\r\n');
      socket.emit('ansi-output', 'U) Upload Files\r\n');
      socket.emit('ansi-output', 'O) Page Sysop\r\n');
      socket.emit('ansi-output', 'DOORS) Door Games & Utilities\r\n');
      socket.emit('ansi-output', 'G) Goodbye\r\n');
      socket.emit('ansi-output', '?) Help\r\n');
    }

    displayMenuPrompt(socket, session);
  } else {
    console.log('menuPause is FALSE, NOT displaying menu - staying in command mode');
  }

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
  const bbsName = 'AmiExpress'; // In real implementation, get from config
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
function handleCommand(socket: any, session: BBSSession, data: string) {
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
    // Any key continues to next state
    if (session.subState === LoggedOnSubState.DISPLAY_BULL) {
      displayConferenceBulletins(socket, session);
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
    return;
  }

  // Handle file area selection (like getDirSpan in AmiExpress)
  if (session.subState === LoggedOnSubState.FILE_AREA_SELECT) {
    console.log('📁 In file area selection state');
    const input = data.trim();
    const areaNumber = parseInt(input);

    if (input === '' || (isNaN(areaNumber) && input !== '0')) {
      // Empty input or invalid - return to menu
      socket.emit('ansi-output', '\r\nReturning to main menu...\r\n');
      session.subState = LoggedOnSubState.DISPLAY_MENU;
      displayMainMenu(socket, session);
      return;
    }

    // Handle door selection
    if (session.tempData?.doorMode) {
      const availableDoors = session.tempData.availableDoors;
      const doorNumber = parseInt(input);

      if (isNaN(doorNumber) || doorNumber < 1 || doorNumber > availableDoors.length) {
        socket.emit('ansi-output', '\r\nInvalid door number.\r\n');
        socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
        session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
        return;
      }

      const selectedDoor = availableDoors[doorNumber - 1];
      executeDoor(socket, session, selectedDoor);
      return;
    }

    // Handle file download selection (when areaFiles are available)
    if (session.tempData?.areaFiles) {
      const areaFiles = session.tempData.areaFiles;
      const fileNumber = parseInt(input);

      if (isNaN(fileNumber) || fileNumber < 1 || fileNumber > areaFiles.length) {
        socket.emit('ansi-output', '\r\nInvalid file number.\r\n');
        socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
        session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
        return;
      }

      const selectedFile = areaFiles[fileNumber - 1];
      socket.emit('ansi-output', `\r\n\x1b[32mSelected file: ${selectedFile.filename}\x1b[0m\r\n`);
      socket.emit('ansi-output', 'Download functionality will be implemented with WebSocket chunking.\r\n');
      socket.emit('ansi-output', 'This will support resumable downloads and progress tracking.\r\n\r\n');
      socket.emit('ansi-output', '\x1b[33mDownload system under development...\x1b[0m\r\n');
      socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
      session.menuPause = false;
      session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
      session.tempData = undefined;
      return;
    }

    // Handle file area selection for upload/download
    if (isNaN(areaNumber) || areaNumber === 0) {
      socket.emit('ansi-output', '\r\nInvalid file area number.\r\n');
      socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
      session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
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
    const input = data.trim().toUpperCase();

    if (input === '') {
      // Empty input - return to menu
      socket.emit('ansi-output', '\r\nReturning to main menu...\r\n');
      session.subState = LoggedOnSubState.DISPLAY_MENU;
      displayMainMenu(socket, session);
      return;
    }

    const tempData = session.tempData as { fileAreas: any[], reverse: boolean, nonStop: boolean };
    const dirSpan = getDirSpan(input, tempData.fileAreas.length);

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
      isNewFiles?: boolean
    };

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
    const confId = parseInt(data.trim());
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
    if (joinConference(socket, session, confId, 1)) { // Default to message base 1
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
    console.log('✅ In READ_COMMAND state, processing line input');
    // Like AmiExpress: Use lineInput for full command lines (supports "j 2", "f", etc.)
    // For now, process the input as a command line (split by space, first part is command)
    const input = data.trim();
    if (input.length > 0) {
      const parts = input.split(' ');
      const command = parts[0].toUpperCase();
      const params = parts.slice(1).join(' ');
      console.log('🚀 Processing command:', command, 'with params:', params);
      processBBSCommand(socket, session, command, params);
    }
  } else if (session.subState === LoggedOnSubState.READ_SHORTCUTS) {
    console.log('🔥 In READ_SHORTCUTS state, processing single key');
    // Process single character hotkeys immediately
    const command = data.trim().toUpperCase();
    if (command.length > 0) {
      processBBSCommand(socket, session, command);
    }
  } else {
    console.log('❌ Not in command input state, current subState:', session.subState, '- IGNORING COMMAND');
  }
  console.log('=== handleCommand end ===\n');
}

// Process BBS commands (processInternalCommand equivalent)
function processBBSCommand(socket: any, session: BBSSession, command: string, params: string = '') {
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

    case 'U': // Upload File(s) (internalCommandU) - uploadaFile(params)
      displayUploadInterface(socket, session, params);
      return;
    case '0': // Remote Shell (internalCommand0)
      console.log('Processing command 0');
      socket.emit('ansi-output', '\x1b[36m-= Remote Shell =-\x1b[0m\r\n');
      socket.emit('ansi-output', 'Remote shell access not available.\r\n');
      break;

    case '1': // Account Editing (internalCommand1) - 1:1 with AmiExpress account editing
      // Check sysop permissions (like AmiExpress secStatus check)
      if ((session.user?.secLevel || 0) < 200) { // Sysop level required
        socket.emit('ansi-output', '\r\n\x1b[31mAccess denied. Sysop privileges required.\x1b[0m\r\n');
        break;
      }

      // Start account editing workflow (like accountEdit() in AmiExpress)
      socket.emit('ansi-output', '\x1b[36m-= Account Editing =-\x1b[0m\r\n');
      socket.emit('ansi-output', 'Enter username to edit (or press Enter for new user validation):\r\n');
      session.subState = LoggedOnSubState.FILE_AREA_SELECT; // Reuse for account selection
      session.tempData = { accountEditing: true };
      return; // Stay in input mode

    case '2': // View Callers Log (internalCommand2) - 1:1 with AmiExpress callers log
      // Check sysop permissions
      if ((session.user?.secLevel || 0) < 200) {
        socket.emit('ansi-output', '\r\n\x1b[31mAccess denied. Sysop privileges required.\x1b[0m\r\n');
        break;
      }

      socket.emit('ansi-output', '\x1b[36m-= Callers Log =-\x1b[0m\r\n');

      // In web version, we'll show recent login activity (simulating callers log)
      // In real AmiExpress, this reads BBS:NODE{x}/CALLERSLOG backwards
      socket.emit('ansi-output', 'Recent login activity:\r\n\r\n');

      // Mock callers log entries (would read from actual log file)
      const mockCallers = [
        { time: '14:05:23', user: 'ByteMaster', action: 'Logged off', duration: '45min' },
        { time: '14:02:15', user: 'AmigaFan', action: 'Downloaded file', duration: '12min' },
        { time: '13:58:42', user: 'RetroUser', action: 'Posted message', duration: '8min' },
        { time: '13:55:12', user: 'NewUser', action: 'Logged on', duration: '2min' },
        { time: '13:50:33', user: 'Sysop', action: 'System maintenance', duration: '120min' }
      ];

      mockCallers.forEach(entry => {
        socket.emit('ansi-output', `${entry.time} ${entry.user.padEnd(15)} ${entry.action.padEnd(20)} ${entry.duration}\r\n`);
      });

      socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
      session.menuPause = false;
      session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
      return;

    case '3': // Edit Directory Files (internalCommand3) - 1:1 with AmiExpress MicroEmacs
      // Check sysop permissions
      if ((session.user?.secLevel || 0) < 200) {
        socket.emit('ansi-output', '\r\n\x1b[31mAccess denied. Sysop privileges required.\x1b[0m\r\n');
        break;
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

    case '4': // Edit Any File (internalCommand4) - 1:1 with AmiExpress MicroEmacs
      // Check sysop permissions
      if ((session.user?.secLevel || 0) < 200) {
        socket.emit('ansi-output', '\r\n\x1b[31mAccess denied. Sysop privileges required.\x1b[0m\r\n');
        break;
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
        break;
      }

      socket.emit('ansi-output', '\x1b[36m-= List System Directories =-\x1b[0m\r\n');
      socket.emit('ansi-output', 'This works just like the AmigaDos List command.\r\n\r\n');
      socket.emit('ansi-output', 'Enter path to list (or press Enter to cancel): ');
      session.subState = LoggedOnSubState.FILE_DIR_SELECT; // Reuse for path input
      session.tempData = { listDirectories: true };
      return; // Stay in input mode

    case 'R': // Read Messages (internalCommandR)
      socket.emit('ansi-output', '\x1b[36m-= Message Reader =-\x1b[0m\r\n');

      // Get messages for current conference and message base
      const currentMessages = messages.filter(msg =>
        msg.conferenceId === session.currentConf &&
        msg.messageBaseId === session.currentMsgBase &&
        (!msg.isPrivate || msg.toUser === session.user?.username || msg.author === session.user?.username)
      );

      if (currentMessages.length === 0) {
        socket.emit('ansi-output', 'No messages in this area.\r\n');
      } else {
        socket.emit('ansi-output', `Reading ${currentMessages.length} message(s)...\r\n\r\n`);

        currentMessages.forEach((msg, index) => {
          const privateIndicator = msg.isPrivate ? '\x1b[31m[PRIVATE]\x1b[0m ' : '';
          const replyIndicator = msg.parentId ? '\x1b[35m[REPLY]\x1b[0m ' : '';
          socket.emit('ansi-output', `\x1b[33m${index + 1}. ${privateIndicator}${replyIndicator}${msg.subject}\x1b[0m\r\n`);
          socket.emit('ansi-output', `\x1b[32mFrom: ${msg.author}\x1b[0m\r\n`);
          if (msg.isPrivate && msg.toUser) {
            socket.emit('ansi-output', `\x1b[32mTo: ${msg.toUser}\x1b[0m\r\n`);
          }
          socket.emit('ansi-output', `\x1b[32mDate: ${msg.timestamp.toLocaleString()}\x1b[0m\r\n\r\n`);
          socket.emit('ansi-output', `${msg.body}\r\n\r\n`);
          if (msg.attachments && msg.attachments.length > 0) {
            socket.emit('ansi-output', `\x1b[36mAttachments: ${msg.attachments.join(', ')}\x1b[0m\r\n\r\n`);
          }
          socket.emit('ansi-output', '\x1b[36m' + '='.repeat(50) + '\x1b[0m\r\n\r\n');
        });
      }

      socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
      // Like AmiExpress: set menuPause=FALSE so menu doesn't display immediately
      session.menuPause = false;
      session.subState = LoggedOnSubState.DISPLAY_CONF_BULL; // Wait for key press
      return; // Don't call displayMainMenu

    case 'A': // Post Message (internalCommandE - message entry)
      // Start message posting workflow - prompt for subject first
      socket.emit('ansi-output', '\x1b[36m-= Post Message =-\x1b[0m\r\n');
      socket.emit('ansi-output', 'Enter your message subject (or press Enter to abort): ');
      session.inputBuffer = ''; // Clear input buffer
      session.subState = LoggedOnSubState.POST_MESSAGE_SUBJECT;
      return; // Don't call displayMainMenu - stay in input mode

    case 'E': // Post Private Message (internalCommandE with private flag)
      // Start private message posting workflow
      socket.emit('ansi-output', '\x1b[36m-= Post Private Message =-\x1b[0m\r\n');
      socket.emit('ansi-output', 'Enter recipient username: ');
      session.inputBuffer = ''; // Clear input buffer
      session.tempData = { isPrivate: true };
      session.subState = LoggedOnSubState.POST_MESSAGE_SUBJECT;
      return; // Don't call displayMainMenu - stay in input mode

    case 'J': // Join Conference (internalCommandJ)
      socket.emit('ansi-output', '\x1b[36m-= Join Conference =-\x1b[0m\r\n');
      socket.emit('ansi-output', 'Available conferences:\r\n');
      conferences.forEach(conf => {
        socket.emit('ansi-output', `${conf.id}. ${conf.name} - ${conf.description}\r\n`);
      });

      // Like AmiExpress: If params provided (e.g., "j 2"), process immediately
      if (params.trim()) {
        const confId = parseInt(params.trim());
        const selectedConf = conferences.find(conf => conf.id === confId);
        if (selectedConf) {
          joinConference(socket, session, confId, 1);
          socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
          session.menuPause = false;
          session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
        } else {
          socket.emit('ansi-output', '\r\n\x1b[31mInvalid conference number.\x1b[0m\r\n');
        }
      } else {
        // No params - prompt for input
        socket.emit('ansi-output', '\r\n\x1b[32mConference number: \x1b[0m');
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
      return;

    case 'FS': // File Status (internalCommandFS) - fileStatus()
      displayFileStatus(socket, session, params);
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

    case 'O_USERS': // Online Users (separate command for compatibility)
      socket.emit('ansi-output', '\x1b[36m-= Online Users =-\x1b[0m\r\n');
      socket.emit('ansi-output', 'Currently online:\r\n\r\n');

      // Get all active sessions
      const onlineUsers = Array.from(sessions.values())
        .filter(sess => sess.state === BBSState.LOGGEDON && sess.user)
        .map(sess => ({
          username: sess.user!.username,
          conference: sess.currentConfName,
          idle: Math.floor((Date.now() - sess.lastActivity) / 60000), // minutes idle
          node: 'Web1' // For now, all users are on the same "node"
        }));

      if (onlineUsers.length === 0) {
        socket.emit('ansi-output', 'No users currently online.\r\n');
      } else {
        onlineUsers.forEach(user => {
          const idleStr = user.idle > 0 ? ` (${user.idle}min idle)` : '';
          socket.emit('ansi-output', `${user.username.padEnd(15)} ${user.conference.padEnd(20)} ${user.node}${idleStr}\r\n`);
        });
      }
      socket.emit('ansi-output', '\r\n');
      break;

    case 'G': // Goodbye (internalCommandG)
      socket.emit('ansi-output', '\r\nGoodbye!\r\n');
      socket.disconnect();
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

    case 'Q': // Quiet Node (internalCommandQ)
      socket.emit('ansi-output', '\x1b[36m-= Quiet Node =-\x1b[0m\r\n');
      socket.emit('ansi-output', 'This command will change the Quiet Node option for your node.\r\n');
      socket.emit('ansi-output', 'With this command a user can prevent other users from seeing them on the WHO list.\r\n');
      socket.emit('ansi-output', '\r\nQuiet node functionality not implemented yet.\r\n');
      break;

    case 'DOORS': // Door Games Menu (new command for Phase 4)
      displayDoorMenu(socket, session, params);
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
      socket.emit('ansi-output', 'D - Download Files\r\n');
      socket.emit('ansi-output', 'U - Upload Files\r\n');
      socket.emit('ansi-output', 'O - Page Sysop for Chat\r\n');
      socket.emit('ansi-output', 'C - Comment to Sysop\r\n');
      socket.emit('ansi-output', 'DOORS - Door Games & Utilities\r\n');
      socket.emit('ansi-output', 'G - Goodbye\r\n');
      socket.emit('ansi-output', 'Q - Quiet Node\r\n');
      socket.emit('ansi-output', '? - This help\r\n');
      break;

    default:
      socket.emit('ansi-output', `\r\nUnknown command: ${command}\r\n`);
      break;
  }

  // Return to menu after command processing (mirroring menuPause logic)
  console.log('Setting subState to DISPLAY_MENU and calling displayMainMenu');
  session.subState = LoggedOnSubState.DISPLAY_MENU;
  displayMainMenu(socket, session);
}

// Initialize data for serverless environment and start server
(async () => {
  try {
    console.log('Starting database initialization...');
    await initializeData();
    console.log('Database initialization completed');

    // Start server with proper error handling for Vercel
    server.listen(port, () => {
      console.log(`🚀 AmiExpress BBS backend running on port ${port}`);
      console.log('🔌 Socket.IO server attached to Express app');
      console.log('🌍 Environment:', process.env.NODE_ENV || 'development');
      console.log('🔧 Vercel deployment active');
      console.log(`📡 Listening on 0.0.0.0:${port}`);
      console.log(`🏥 Health check available at: http://0.0.0.0:${port}/health`);
    });

    // Handle server errors gracefully
    server.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRINUSE') {
        console.error(`Port ${port} is already in use`);
      } else {
        console.error('Server error:', error);
      }
      process.exit(1);
    });

    // Handle graceful shutdown
    process.on('SIGTERM', () => {
      console.log('SIGTERM received, shutting down gracefully');
      server.close(() => {
        console.log('Server closed');
        process.exit(0);
      });
    });

    process.on('SIGINT', () => {
      console.log('SIGINT received, shutting down gracefully');
      server.close(() => {
        console.log('Server closed');
        process.exit(0);
      });
    });

  } catch (error) {
    console.error('Failed to initialize database:', error);
    // Don't exit in production - try to start anyway
    if (process.env.NODE_ENV !== 'production') {
      process.exit(1);
    } else {
      console.log('Continuing despite database error...');
      server.listen(port, () => {
        console.log(`🚀 AmiExpress BBS backend running on port ${port} (with database issues)`);
        console.log('🔌 Socket.IO server attached to Express app');
        console.log('🌍 Environment:', process.env.NODE_ENV || 'development');
        console.log('🔧 Vercel deployment active');
        console.log(`📡 Listening on 0.0.0.0:${port}`);
        console.log(`🏥 Health check available at: http://0.0.0.0:${port}/health`);
      });
    }
  }
})();

// Socket.IO connection logging will be handled in the existing connection handler
// Global data caches (loaded from database)
let conferences: any[] = [];
let messageBases: any[] = [];
let fileAreas: any[] = [];
let fileEntries: any[] = [];
let messages: any[] = [];

// Initialize data from database
async function initializeData() {
  try {
    console.log('Starting database initialization...');

    conferences = await db.getConferences();
    console.log(`Loaded ${conferences.length} conferences`);

    if (conferences.length === 0) {
      console.log('No conferences found, initializing default data...');
      await db.initializeDefaultData();
      conferences = await db.getConferences();
      console.log(`After initialization: ${conferences.length} conferences`);
    }

    // Load message bases for all conferences
    messageBases = [];
    for (const conf of conferences) {
      const bases = await db.getMessageBases(conf.id);
      messageBases.push(...bases);
    }
    console.log(`Loaded ${messageBases.length} message bases`);

    // Load file areas for all conferences
    fileAreas = [];
    for (const conf of conferences) {
      const areas = await db.getFileAreas(conf.id);
      fileAreas.push(...areas);
    }
    console.log(`Loaded ${fileAreas.length} file areas`);

    // Load some recent messages
    try {
      messages = await db.getMessages(1, 1, { limit: 50 });
      console.log(`Loaded ${messages.length} messages`);
    } catch (error) {
      console.warn('Failed to load messages, continuing without them:', error);
      messages = [];
    }

    // Initialize doors
    await initializeDoors();
    console.log(`Initialized ${doors.length} doors`);

    console.log('Database initialized successfully with:', {
      conferences: conferences.length,
      messageBases: messageBases.length,
      fileAreas: fileAreas.length,
      messages: messages.length,
      doors: doors.length
    });
  } catch (error) {
    console.error('Failed to initialize data:', error);
    throw error; // Re-throw to ensure calling code knows about the failure
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