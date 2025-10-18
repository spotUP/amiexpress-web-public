// Load environment variables FIRST, before any other imports
require('dotenv').config({ path: './.env' });

// Debug: Log environment variables (only in development)
if (process.env.NODE_ENV !== 'production') {
  console.log('Environment variables loaded:');
  console.log('POSTGRES_URL:', process.env.POSTGRES_URL ? 'SET' : 'NOT SET');
  console.log('DATABASE_URL:', process.env.DATABASE_URL ? 'SET' : 'NOT SET');
  console.log('NODE_ENV:', process.env.NODE_ENV);
}

import express, { Request, Response } from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { Door } from './types';
import { db } from './database';
import { terminateAllSessions } from './amiga-emulation/doorHandler';
import { setupBBSConnection } from './handlers/connectionHandler';
import { RedisSessionStore } from './server/sessionStore';
import {
  setConferences,
  setMessageBases,
  setFileAreas,
  setDoors,
  setMessages,
  conferences,
  messageBases,
  fileAreas,
  doors,
  messages
} from './server/dataStore';

const app = express();

// Configure CORS for Render.com deployment
const corsOptions = {
  origin: function (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
    // Allow requests from localhost (development) and Render.com deployments
    const allowedOrigins = [
      "http://localhost:5173",
      "http://localhost:5174",
      "http://localhost:3000",
      "http://localhost:3001",
      /^https:\/\/amiexpress.*\.onrender\.com$/,
      /^https:\/\/amiexpress-frontend.*\.onrender\.com$/,
      /^https:\/\/.*\.vercel\.app$/,  // Allow ALL Vercel deployment URLs (wildcard)
      "https://amiexpress-web-three.vercel.app"
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
    environment: process.env.NODE_ENV || 'development',
    keepAlive: true // Indicate server is designed to stay alive
  });
});

// Add keep-alive endpoint to prevent Render.com from spinning down
app.get('/keep-alive', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'alive',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    connections: io.sockets.sockets.size,
    message: 'Server is active and ready for connections'
  });
});

// Create HTTP server
const server = createServer(app);

// Configure Socket.IO for maximum stability and reliability
const io = new Server(server, {
  cors: corsOptions,
  transports: ['websocket', 'polling'], // Prefer WebSocket first, fallback to polling
  allowEIO3: true, // Allow Engine.IO v3 clients for compatibility

  // Aggressive keep-alive settings for stability
  pingTimeout: 120000, // 2 minutes before considering connection dead
  pingInterval: 25000, // Send ping every 25 seconds

  // Connection timeouts
  connectTimeout: 60000, // 1 minute to establish connection

  // Upgrade settings for reliability
  upgradeTimeout: 30000, // 30 seconds to upgrade transport

  // Buffer settings
  maxHttpBufferSize: 1e8, // 100MB for file uploads
  perMessageDeflate: false, // Disable compression for better performance

  // HTTP long-polling settings
  httpCompression: true,

  // Cookie and session settings
  cookie: false, // Disable cookies for better compatibility

  // Reconnection settings (client-side will use these hints)
  allowUpgrades: true, // Allow transport upgrades

  // Additional security check
  allowRequest: (req: any, callback: (err: string | null, success: boolean) => void) => {
    const origin = req.headers.origin;
    if (origin && corsOptions.origin(origin, () => {}) !== null) {
      callback(null, true);
    } else {
      console.warn(`> CORS blocked connection from origin: ${origin}`);
      callback('CORS error', false);
    }
  }
});

// Create Redis session store
const sessions = new RedisSessionStore();

// Basic route
app.get('/', (req: Request, res: Response) => {
  res.json({ message: 'AmiExpress Backend API' });
});

// API endpoint to get user profile
app.get('/api/user/:userId', async (req: Request, res: Response) => {
  const { userId } = req.params;
  const user = await db.getUser(parseInt(userId));
  res.json(user);
});

// Multer configuration for door uploads
const upload = multer({
  dest: path.join(__dirname, '../uploads/doors'),
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB limit
  }
});

// Door upload endpoint (for sysops in door manager)
app.post('/api/upload/door', upload.single('door'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    console.log('> Door file uploaded:', req.file.originalname);

    // TODO: Validate file is a valid door archive (.lha, .zip, etc)
    // TODO: Extract and scan for door metadata
    // TODO: Add to database

    res.json({
      success: true,
      filename: req.file.filename,
      originalname: req.file.originalname,
      size: req.file.size
    });
  } catch (error) {
    console.error('Door upload error:', error);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// BBS connection handler
io.on('connection', async (socket) => {
  await setupBBSConnection(socket, io, sessions);
});

// ====================================================================
// DATA INITIALIZATION
// ====================================================================

let fileEntries: any[] = [];

// Initialize data from database
async function initializeData() {
  try {
    console.log('Starting database initialization...');

    const confs = await db.getConferences();
    console.log(`Loaded ${confs.length} conferences`);

    if (confs.length === 0) {
      console.log('No conferences found, initializing default data...');
      await db.initializeDefaultData();
      // Refresh all data after initialization and cleanup
      const refreshedConfs = await db.getConferences();
      setConferences(refreshedConfs);
      console.log(`After initialization: ${conferences.length} conferences`);
    } else {
      // Check if we need to clean up duplicates in existing data
      console.log('Checking for duplicate conferences in existing data...');
      const needsCleanup = confs.some((conf, index) =>
        confs.findIndex(c => c.name === conf.name) !== index
      );

      if (needsCleanup) {
        console.log('Found duplicates, running cleanup...');
        await db.cleanupDuplicateConferences();

        // Refresh all data after cleanup
        const cleanedConfs = await db.getConferences();
        setConferences(cleanedConfs);
        console.log(`After cleanup: ${conferences.length} conferences`);
      } else {
        setConferences(confs);
      }
    }

    // Always run message base cleanup to remove accumulated duplicates
    console.log('Running message base duplicate cleanup...');
    await db.cleanupDuplicateMessageBases();

    // Load message bases for all conferences (limit to prevent timeout)
    const allMessageBases = [];
    const maxConferencesToLoad = 10; // Limit to prevent timeout
    const conferencesToLoad = conferences.slice(0, maxConferencesToLoad);
    for (const conf of conferencesToLoad) {
      try {
        const bases = await db.getMessageBases(conf.id);
        console.log(`> Loaded ${bases.length} message bases for conference ${conf.id} (${conf.name})`);
        if (bases.length > 0) {
          console.log(`> Sample message base:`, JSON.stringify(bases[0], null, 2));
        }
        allMessageBases.push(...bases);
      } catch (error) {
        console.warn(`Failed to load message bases for conference ${conf.id}:`, error);
      }
    }
    setMessageBases(allMessageBases);
    console.log(`Loaded ${messageBases.length} message bases (limited to ${maxConferencesToLoad} conferences)`);
    if (messageBases.length > 0) {
      console.log(`> First 3 message bases in global array:`, messageBases.slice(0, 3).map(mb => ({ id: mb.id, name: mb.name, conferenceId: mb.conferenceId })));
    }

    // Load file areas for all conferences (limit to prevent timeout)
    const allFileAreas = [];
    for (const conf of conferencesToLoad) {
      try {
        const areas = await db.getFileAreas(conf.id);
        allFileAreas.push(...areas);
      } catch (error) {
        console.warn(`Failed to load file areas for conference ${conf.id}:`, error);
      }
    }
    setFileAreas(allFileAreas);
    console.log(`Loaded ${fileAreas.length} file areas (limited to ${maxConferencesToLoad} conferences)`);

    // Load some recent messages
    try {
      const recentMessages = await db.getMessages(1, 1, { limit: 50 });
      setMessages(recentMessages);
      console.log(`Loaded ${messages.length} messages`);
    } catch (error) {
      console.warn('Failed to load messages, continuing without them:', error);
      setMessages([]);
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
    // Don't throw error - continue with server startup
    console.log('Continuing with server startup despite database initialization error');
  }
}

// Initialize door collection
async function initializeDoors() {
  console.log('> Initializing doors...');
  const doorList: Door[] = [
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
      path: 'doors/CheckUP',
      accessLevel: 255, // Sysop only
      enabled: true,
      type: 'utility',
      parameters: []
    }
  ];
  setDoors(doorList);
}

// ====================================================================
// SERVER STARTUP
// ====================================================================

// Graceful shutdown handling
process.on('SIGTERM', async () => {
  console.log('> SIGTERM received, shutting down gracefully...');
  await terminateAllSessions();
  await sessions.close();
  server.close(() => {
    console.log('> Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  console.log('\n> SIGINT received, shutting down gracefully...');
  await terminateAllSessions();
  await sessions.close();
  server.close(() => {
    console.log('> Server closed');
    process.exit(0);
  });
});

// Start server with proper port binding
const port = parseInt(process.env.PORT || '3001', 10);

// For Render.com deployments, bind to 0.0.0.0
if (process.env.RENDER || process.env.NODE_ENV === 'production') {
  initializeData().then(() => {
    server.listen(port, '0.0.0.0', () => {
      console.log(`
> AmiExpress BBS Backend Server
> Environment: ${process.env.NODE_ENV || 'development'}
> Port: ${port}
> Address: 0.0.0.0:${port}
> Ready for connections
      `);
    });
  });
} else {
  // For local development
  initializeData().then(() => {
    server.listen(port, () => {
      console.log(`
> AmiExpress BBS Backend Server (Development)
> Port: ${port}
> URL: http://localhost:${port}
> Ready for connections
      `);
    });
  });
}
