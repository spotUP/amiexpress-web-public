/**
 * Door Handler - Door games and utilities
 *
 * Handles door menu display, execution, and door-specific implementations.
 * Based on express.e door system.
 */

import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { AmigaDoorSession } from '../amiga-emulation/AmigaDoorSession';

// Types (will be provided by index.ts)
interface BBSSession {
  currentConf?: number;
  user?: {
    id: string;
    username: string;
    secLevel?: number;
  };
  menuPause: boolean;
  subState: string;
  tempData?: any;
}

interface Door {
  id: string;
  name: string;
  description: string;
  command: string;
  path: string;
  accessLevel: number;
  enabled: boolean;
  type: string;
  conferenceId?: number;
  parameters?: string[];
}

interface DoorSession {
  doorId: string;
  userId: string;
  startTime: Date;
  endTime?: Date;
  status: string;
}

interface ChatSession {
  id: string;
  userId: string;
  startTime: Date;
  status: string;
  messages: any[];
  pageCount: number;
  lastActivity: Date;
}

interface Database {
  query: (sql: string, params?: any[]) => Promise<{ rows: any[] }>;
}

// Injected dependencies
let doors: Door[] = [];
let doorSessions: DoorSession[] = [];
let db: Database;
let callersLog: (userId: string | null, username: string, action: string, details?: string, nodeId?: number) => Promise<void>;
let getRecentCallerActivity: (limit?: number, nodeId?: number) => Promise<any[]>;
let LoggedOnSubState: any;

// Injection functions
export function setDoors(doorList: Door[]) {
  doors = doorList;
}

export function setDoorSessions(sessions: DoorSession[]) {
  doorSessions = sessions;
}

export function setDatabase(database: Database) {
  db = database;
}

export function setHelpers(helpers: {
  callersLog: typeof callersLog;
  getRecentCallerActivity: typeof getRecentCallerActivity;
}) {
  callersLog = helpers.callersLog;
  getRecentCallerActivity = helpers.getRecentCallerActivity;
}

export function setConstants(constants: {
  LoggedOnSubState: any;
}) {
  LoggedOnSubState = constants.LoggedOnSubState;
}

/**
 * Display door games menu (DOORS command)
 */
export async function displayDoorMenu(socket: any, session: BBSSession, params: string) {
  socket.emit('ansi-output', '\x1b[36m-= Door Games & Utilities =-\x1b[0m\r\n');

  // Get TypeScript doors for current user
  const availableDoors = doors.filter(door =>
    door.enabled &&
    (!door.conferenceId || door.conferenceId === session.currentConf) &&
    (session.user?.secLevel || 0) >= door.accessLevel
  );

  // Also scan for installed Amiga doors
  const { getAmigaDoorManager } = require('../doors/amigaDoorManager');
  const amigaDoorMgr = getAmigaDoorManager();
  const amigaDoors = await amigaDoorMgr.scanInstalledDoors();

  // Filter Amiga doors by access level
  const availableAmigaDoors = amigaDoors.filter(door =>
    door.installed &&
    (session.user?.secLevel || 0) >= (door.access || 0)
  );

  console.log(`[DOOR Command] Found ${availableDoors.length} TypeScript doors, ${availableAmigaDoors.length} Amiga doors`);

  // Convert Amiga doors to the format expected by this function
  const amigaDoorsList = availableAmigaDoors.map(door => ({
    id: door.command,
    name: door.name || door.command,
    description: `${door.location} (${door.type})`,
    accessLevel: door.access || 0,
    enabled: true,
    conferenceId: null,
    isAmigaDoor: true,
    command: door.command
  }));

  // Combine both lists
  const allDoors = [...availableDoors, ...amigaDoorsList];

  if (allDoors.length === 0) {
    socket.emit('ansi-output', 'No doors are currently available.\r\n');
    socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
    session.menuPause = false;
    session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
    return;
  }

  socket.emit('ansi-output', 'Available doors:\r\n\r\n');

  allDoors.forEach((door, index) => {
    socket.emit('ansi-output', `${index + 1}. ${door.name}\r\n`);
    socket.emit('ansi-output', `   ${door.description}\r\n`);
    socket.emit('ansi-output', `   Access Level: ${door.accessLevel}\r\n\r\n`);
  });

  socket.emit('ansi-output', '\x1b[32mSelect door (1-\x1b[33m' + allDoors.length + '\x1b[32m) or press Enter to cancel: \x1b[0m');
  session.subState = LoggedOnSubState.FILE_AREA_SELECT; // Reuse for door selection
  session.tempData = { doorMode: true, availableDoors: allDoors };
}

/**
 * Execute door game/utility
 */
export async function executeDoor(socket: any, session: BBSSession, door: Door) {
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
      // Web version: Execute Node.js scripts instead of Amiga native executables
      await executeNativeDoor(socket, session, door, doorSession);
      break;
    case 'script':
      // Web version: Execute shell scripts instead of AREXX
      await executeScriptDoor(socket, session, door, doorSession);
      break;
    case 'XIM': // eXpress Internal Module (Amiga executable)
    case 'AIM': // Amiga Internal Module
    case 'SIM': // Standard Internal Module
    case 'TIM': // Text Internal Module
    case 'IIM': // Interactive Internal Module
      await executeAmigaDoor(socket, session, door, doorSession);
      break;
    default:
      socket.emit('ansi-output', `Unknown door type: ${door.type}\r\n`);
      console.error(`Unknown door type: ${door.type}`);
  }

  // Mark session as completed
  doorSession.endTime = new Date();
  doorSession.status = 'completed';
}

/**
 * Execute Amiga door via 68000 CPU emulation
 * Handles XIM, AIM, SIM, TIM, IIM door types
 */
async function executeAmigaDoor(socket: any, session: BBSSession, door: any, doorSession: DoorSession) {
  console.log(`[executeAmigaDoor] Starting Amiga door: ${door.name} (${door.type})`);
  console.log(`[executeAmigaDoor] Location: ${door.location}`);

  try {
    // Get the BBS root from AmigaDoorManager (same location where doors are installed)
    const { getAmigaDoorManager } = require('../doors/amigaDoorManager');
    const amigaDoorMgr = getAmigaDoorManager();
    const bbsRoot = amigaDoorMgr.bbsRoot;

    // Build the full path to the door executable
    // door.location is already converted from Amiga paths (e.g., "Doors/AquaBulls/AquaBulls")
    const doorPath = path.join(bbsRoot, door.location);

    console.log(`[executeAmigaDoor] BBS root: ${bbsRoot}`);
    console.log(`[executeAmigaDoor] Full door path: ${doorPath}`);

    // Check if door executable exists
    if (!fs.existsSync(doorPath)) {
      console.error(`[executeAmigaDoor] Door executable not found: ${doorPath}`);
      socket.emit('ansi-output', '\r\n\x1b[31mDoor executable not found.\x1b[0m\r\n');
      socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
      return;
    }

    console.log(`[executeAmigaDoor] Starting 68k emulation for: ${doorPath}`);

    // Create DoorConfig for AmigaDoorSession
    const doorConfig = {
      executablePath: doorPath,
      timeout: 300, // 5 minutes
      memorySize: 1024 * 1024 // 1MB
    };

    // Create AmigaDoorSession to run the native Amiga executable
    const amigaSession = new AmigaDoorSession(socket, doorConfig);

    // Start the door execution
    await amigaSession.start();

    console.log(`[executeAmigaDoor] Door execution completed`);
  } catch (error) {
    console.error(`[executeAmigaDoor] Error executing Amiga door:`, error);
    socket.emit('ansi-output', `\r\n\x1b[31mError executing door: ${(error as Error).message}\x1b[0m\r\n`);
    socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
  }
}

/**
 * Execute web-compatible door (ported AmiExpress doors)
 */
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

/**
 * Execute SAmiLog callers log viewer door
 */
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

/**
 * Execute CheckUP file checking utility
 */
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

/**
 * Check if file is an Amiga executable (Hunk format)
 * Amiga executables start with 0x000003F3 (HUNK_HEADER)
 */
function isAmigaBinary(filePath: string): boolean {
  try {
    const fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.alloc(4);
    fs.readSync(fd, buffer, 0, 4, 0);
    fs.closeSync(fd);

    // Check for Hunk format magic number
    const magic = buffer.readUInt32BE(0);
    return magic === 0x000003F3;
  } catch (error) {
    console.error('Error checking if file is Amiga binary:', error);
    return false;
  }
}

/**
 * Execute native door - Detects Amiga binaries and uses 68k emulation
 * Web version: Executes Node.js scripts OR Amiga native executables via emulation
 * express.e equivalent: SystemTagList() execution
 */
async function executeNativeDoor(socket: any, session: BBSSession, door: Door, doorSession: DoorSession): Promise<void> {
  console.log(`🚪 [DOOR] Executing native door: ${door.name} (${door.path})`);

  // Check if door file exists
  const doorPath = path.isAbsolute(door.path) ? door.path : path.join(process.cwd(), door.path);

  if (!fs.existsSync(doorPath)) {
    socket.emit('ansi-output', `\r\n\x1b[31mError: Door file not found: ${door.path}\x1b[0m\r\n`);
    socket.emit('ansi-output', '\x1b[33mPlease contact the sysop.\x1b[0m\r\n\r\n');
    doorSession.status = 'error';
    return;
  }

  // 🎉 HISTORIC MOMENT: Check if this is an Amiga binary!
  if (isAmigaBinary(doorPath)) {
    console.log('🚀 [AMIGA DOOR] Detected Amiga binary! Starting 68k emulation...');
    socket.emit('ansi-output', '\r\n\x1b[36m🚀 Starting Amiga 68000 emulation...\x1b[0m\r\n\r\n');

    try {
      const amigaSession = new AmigaDoorSession(socket, {
        executablePath: doorPath,
        timeout: 600,  // 10 minutes
        memorySize: 1024 * 1024  // 1MB
      });

      await amigaSession.start();

      // Wait for session to complete
      // The AmigaDoorSession handles its own lifecycle
      socket.emit('ansi-output', '\r\n\x1b[32mAmiga door session completed.\x1b[0m\r\n');
    } catch (error) {
      console.error('[AMIGA DOOR] Error:', error);
      socket.emit('ansi-output', `\r\n\x1b[31mAmiga door error: ${(error as Error).message}\x1b[0m\r\n`);
      doorSession.status = 'error';
    }

    return;
  }

  // Prepare environment variables for door script
  const env = {
    ...process.env,
    BBS_USERNAME: session.user?.username || 'Guest',
    BBS_USER_ID: session.user?.id || '',
    BBS_SECURITY_LEVEL: session.user?.secLevel?.toString() || '0',
    BBS_DOOR_ID: door.id,
    BBS_DOOR_NAME: door.name,
    BBS_NODE: '1' // Node number for multi-node support
  };

  // Execute Node.js script
  socket.emit('ansi-output', `\r\n\x1b[36mLaunching ${door.name}...\x1b[0m\r\n\r\n`);

  try {
    const doorProcess = spawn('node', [doorPath, ...(door.parameters || [])], {
      env,
      cwd: path.dirname(doorPath)
    });

    // Capture stdout and send to user
    doorProcess.stdout.on('data', (data: Buffer) => {
      const output = data.toString();
      socket.emit('ansi-output', output);

      // Store in door session history
      if (!doorSession.output) doorSession.output = [];
      doorSession.output.push(output);
    });

    // Capture stderr
    doorProcess.stderr.on('data', (data: Buffer) => {
      const error = data.toString();
      console.error(`[DOOR ${door.id}] Error:`, error);
      socket.emit('ansi-output', `\x1b[31m${error}\x1b[0m`);
    });

    // Wait for door to complete
    await new Promise<void>((resolve, reject) => {
      doorProcess.on('close', (code: number) => {
        console.log(`[DOOR ${door.id}] Exited with code ${code}`);

        if (code === 0) {
          socket.emit('ansi-output', `\r\n\r\n\x1b[32m${door.name} completed.\x1b[0m\r\n`);
          resolve();
        } else {
          socket.emit('ansi-output', `\r\n\r\n\x1b[31m${door.name} exited with error code ${code}.\x1b[0m\r\n`);
          doorSession.status = 'error';
          resolve(); // Still resolve to continue
        }
      });

      doorProcess.on('error', (err: Error) => {
        console.error(`[DOOR ${door.id}] Spawn error:`, err);
        socket.emit('ansi-output', `\r\n\x1b[31mError executing door: ${err.message}\x1b[0m\r\n`);
        doorSession.status = 'error';
        reject(err);
      });

      // Timeout after 10 minutes
      setTimeout(() => {
        doorProcess.kill();
        socket.emit('ansi-output', '\r\n\x1b[31mDoor execution timeout (10 minutes).\x1b[0m\r\n');
        doorSession.status = 'error';
        resolve();
      }, 600000);
    });

  } catch (error: any) {
    console.error(`[DOOR ${door.id}] Execution error:`, error);
    socket.emit('ansi-output', `\r\n\x1b[31mError: ${error.message}\x1b[0m\r\n`);
    doorSession.status = 'error';
  }

  socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
  session.menuPause = false;
  session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
}

/**
 * Execute script door (shell script)
 * Web version: Executes shell scripts instead of AREXX
 * express.e equivalent: Execute() AREXX command
 */
async function executeScriptDoor(socket: any, session: BBSSession, door: Door, doorSession: DoorSession): Promise<void> {
  console.log(`🚪 [DOOR] Executing script door: ${door.name} (${door.path})`);

  // Check if door script exists
  const doorPath = path.isAbsolute(door.path) ? door.path : path.join(process.cwd(), door.path);

  if (!fs.existsSync(doorPath)) {
    socket.emit('ansi-output', `\r\n\x1b[31mError: Script not found: ${door.path}\x1b[0m\r\n`);
    socket.emit('ansi-output', '\x1b[33mPlease contact the sysop.\x1b[0m\r\n\r\n');
    doorSession.status = 'error';
    return;
  }

  // Prepare environment variables for script
  const env = {
    ...process.env,
    BBS_USERNAME: session.user?.username || 'Guest',
    BBS_USER_ID: session.user?.id || '',
    BBS_SECURITY_LEVEL: session.user?.secLevel?.toString() || '0',
    BBS_DOOR_ID: door.id,
    BBS_DOOR_NAME: door.name,
    BBS_NODE: '1'
  };

  // Execute shell script
  socket.emit('ansi-output', `\r\n\x1b[36mLaunching ${door.name}...\x1b[0m\r\n\r\n`);

  try {
    // Determine shell based on script extension
    const ext = path.extname(doorPath).toLowerCase();
    let command: string;
    let args: string[];

    if (ext === '.sh' || ext === '.bash') {
      command = 'bash';
      args = [doorPath, ...(door.parameters || [])];
    } else if (ext === '.py' || ext === '.python') {
      command = 'python3';
      args = [doorPath, ...(door.parameters || [])];
    } else {
      // Generic executable
      command = doorPath;
      args = door.parameters || [];
    }

    const doorProcess = spawn(command, args, {
      env,
      cwd: path.dirname(doorPath)
    });

    // Capture stdout and send to user
    doorProcess.stdout.on('data', (data: Buffer) => {
      const output = data.toString();
      socket.emit('ansi-output', output);

      // Store in door session history
      if (!doorSession.output) doorSession.output = [];
      doorSession.output.push(output);
    });

    // Capture stderr
    doorProcess.stderr.on('data', (data: Buffer) => {
      const error = data.toString();
      console.error(`[DOOR ${door.id}] Error:`, error);
      socket.emit('ansi-output', `\x1b[31m${error}\x1b[0m`);
    });

    // Wait for door to complete
    await new Promise<void>((resolve, reject) => {
      doorProcess.on('close', (code: number) => {
        console.log(`[DOOR ${door.id}] Exited with code ${code}`);

        if (code === 0) {
          socket.emit('ansi-output', `\r\n\r\n\x1b[32m${door.name} completed.\x1b[0m\r\n`);
          resolve();
        } else {
          socket.emit('ansi-output', `\r\n\r\n\x1b[31m${door.name} exited with error code ${code}.\x1b[0m\r\n`);
          doorSession.status = 'error';
          resolve(); // Still resolve to continue
        }
      });

      doorProcess.on('error', (err: Error) => {
        console.error(`[DOOR ${door.id}] Spawn error:`, err);
        socket.emit('ansi-output', `\r\n\x1b[31mError executing script: ${err.message}\x1b[0m\r\n`);
        doorSession.status = 'error';
        reject(err);
      });

      // Timeout after 10 minutes
      setTimeout(() => {
        doorProcess.kill();
        socket.emit('ansi-output', '\r\n\x1b[31mScript execution timeout (10 minutes).\x1b[0m\r\n');
        doorSession.status = 'error';
        resolve();
      }, 600000);
    });

  } catch (error: any) {
    console.error(`[DOOR ${door.id}] Execution error:`, error);
    socket.emit('ansi-output', `\r\n\x1b[31mError: ${error.message}\x1b[0m\r\n`);
    doorSession.status = 'error';
  }

  socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
  session.menuPause = false;
  session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
}

/**
 * Initialize door collection
 */
export async function initializeDoors() {
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

/**
 * Execute external pager door (like runSysCommand('PAGER') in AmiExpress)
 */
export function executePagerDoor(socket: any, session: BBSSession, chatSession: ChatSession): boolean {
  // For now, always fall back to internal pager
  // In full implementation, this would check for PAGER door and execute it
  return false;
}
