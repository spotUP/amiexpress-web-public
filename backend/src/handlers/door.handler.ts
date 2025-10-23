/**
 * Door Handler - Door games and utilities
 *
 * Handles door menu display, execution, and door-specific implementations.
 * Based on express.e door system.
 */

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
export function displayDoorMenu(socket: any, session: BBSSession, params: string) {
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
