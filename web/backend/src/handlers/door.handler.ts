/**
 * Door Handler - Door games and utilities
 *
 * Handles door menu display, execution, and door-specific implementations.
 * Based on express.e door system.
 */

import { spawn, fork } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as amigafs from '../utils/amigafs';
import { resolveCaseInsensitivePath } from '../utils/fs-amiga.util';
import { AmigaDoorSession } from '../amiga-emulation/AmigaDoorSession';
import { callersLogManager } from '../services/CallersLogManager';
import { doorDropFileManager } from '../services/DoorDropFileManager';
import { config } from '../config';
import { BBSState } from '../index';
import { SysopDebugUtil, DebugSeverity } from '../utils/sysop-debug.util';
import { DebugLogger } from '../utils/debug-logger.util';

import type { BBSSession } from '../index';
import type { User } from '../database/types';

function logDoorDebug(message: string) {
  try {
    const logPath = path.join(process.cwd(), '..', '..', 'logs', 'door-68k.log');
    const line = `[DoorDebug] ${new Date().toISOString()} ${message}\n`;
    fs.appendFileSync(logPath, line, { encoding: 'utf8' });
  } catch (err) {
    console.error('[DoorDebug] Failed to log door debug:', err);
  }
}

function disableShortcuts(session: BBSSession) {
  session.cmdShortcuts = false;
  if (session.shortcuts && typeof session.shortcuts.clear === 'function') {
    session.shortcuts.clear();
  }
}

function applyAcpSideEffect(session: BBSSession, acp: { code: number; targetNode: number; command?: string }) {
  switch (acp.code) {
    case -1: // ACP_CONTROLCOMMAND
      break;
    case 1: // ACP_SysopLogin
      session.quietFlag = false;
      break;
    case 2: // ACP_InstantLogin
      session.quietFlag = false;
      break;
    case 3: // ACP_AEShell
      session.quietFlag = false;
      break;
    case 4: // ACP_ToggleChat
      session.quietFlag = !session.quietFlag;
      break;
    case 5: // ACP_ExitNode
      session.state = BBSState.AWAIT;
      session.subState = LoggedOnSubState.LOGOFF;
      break;
    case 6: // ACP_LocalLogin
      session.quietFlag = false;
      break;
    case 7: // ACP_ReserveNode
      session.quietFlag = true;
      break;
    case 8: // ACP_Accounts
      session.quietFlag = false;
      break;
    case 9: // ACP_InitModem
      session.quietFlag = false;
      break;
    case 10: // ACP_NodeOffHook
      session.quietFlag = true;
      break;
    case 11: // ACP_QuietNode
      session.quietFlag = true;
      break;
    case 12: // ACP_NodeConfig
      session.quietFlag = true;
      break;
    case 13: // ACP_NodeChat
      session.quietFlag = false;
      break;
    case 14: // ACP_SaveWin
      session.quietFlag = false;
      break;
    case 15: // ACP_NRAMS
      session.quietFlag = false;
      break;
    case 19: // ACP_CUSTOMCOMMAND
      break;
    default:
      // For other ACP codes, we simply record the request on the session
      break;
  }
  (session as any).acpLastAction = { ...acp, timestamp: Date.now() };
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
  mciText?: string;  // For MCI type doors (express.e:4293-4297)
  stack?: number;
  priority?: string;
  resident?: boolean;
  expertMode?: boolean;
  trapOn?: boolean;
  silent?: boolean;
  quickMode?: boolean;
  multiNode?: boolean;
  logInputs?: boolean;
  scriptCheck?: boolean;
  banner?: string;
  mimicVer?: string;
  passParameters?: number;
  internal?: string;
  args?: string;
  toolTypes?: Record<string, string>;
}

interface DoorSession {
  doorId: string;
  userId: string;
  startTime: Date;
  endTime?: Date;
  status: string;
  output?: string[]; // Array of output strings from door execution
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

export function getDoors(): Door[] {
  return doors;
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

function resolveDoorExecutionUser(session: BBSSession): { user: User; isGuest: boolean } {
  if (session.user) {
    return { user: session.user, isGuest: false };
  }

  const now = new Date();
  const nodeId = session.nodeId || 0;
  const linesPerScreen = session.tempData?.termHeight || session.screenHeight || 24;

  const guestUser: User = {
    id: `guest-${nodeId}`,
    username: 'Guest',
    passwordHash: '',
    realname: 'Guest User',
    location: session.connectionHostname || session.remoteAddress || 'Unknown',
    phone: '000-000-0000',
    secLevel: 0,
    uploads: 0,
    downloads: 0,
    bytesUpload: 0,
    bytesDownload: 0,
    ratio: 0,
    ratioType: 0,
    timeTotal: 0,
    timeLimit: Math.floor((session.timeRemaining || 3600) / 60),
    timeUsed: 0,
    chatLimit: 0,
    chatUsed: 0,
    firstLogin: now,
    calls: 0,
    callsToday: 0,
    newUser: true,
    expert: 'N',
    ansi: session.ansiEnabled !== false,
    linesPerScreen,
    computer: 'Unknown',
    screenType: session.petsciiMode ? 'PETSCII' : 'ANSI',
    protocol: 'Z',
    editor: 'NONE',
    zoomType: '',
    availableForChat: false,
    quietNode: false,
    autoRejoin: session.confRJoin || 1,
    confAccess: '',
    areaName: session.currentConfName || 'General',
    uuCP: false,
    topUploadCPS: 0,
    topDownloadCPS: 0,
    byteLimit: 0,
    userFlags: 0,
    created: now,
    updated: now
  };

  return { user: guestUser, isGuest: true };
}

/**
 * Launch an Amiga door using AmigaDoorSession
 */
async function launchAmigaDoor(socket: any, session: BBSSession, doorInfo: any) {
  try {
    console.log(`[launchAmigaDoor] Starting door: ${doorInfo.command}`);
    console.log(`[launchAmigaDoor] Location: ${doorInfo.location}`);
    console.log(`[launchAmigaDoor] Resolved path: ${doorInfo.resolvedPath}`);

    // Check if door executable exists
    if (!fs.existsSync(doorInfo.resolvedPath)) {
      socket.emit('ansi-output', `\r\n\x1b[31mDoor executable not found: ${doorInfo.resolvedPath}\x1b[0m\r\n`);
      socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
      session.menuPause = false;
      session.subState = LoggedOnSubState.DISPLAY_MENU;
      return;
    }

    disableShortcuts(session);

    // Log door launch
    DebugLogger.door(socket.id, `Launching door: ${doorInfo.name || doorInfo.command}`, {
      command: doorInfo.command,
      name: doorInfo.name,
      path: doorInfo.resolvedPath,
      type: doorInfo.type || 'Amiga 68K',
      stack: doorInfo.stack
    });

    // Create AmigaDoorSession - interactive doors need guard disabled
    const amigaSession = new AmigaDoorSession(socket, {
      executablePath: doorInfo.resolvedPath,
      timeout: 600,
      doorId: doorInfo.command || doorInfo.id,
      stack: doorInfo.stack,
      toolTypes: { DISABLE_GUARD: 'true' },
      bbsSession: {
        user: session.user,
        nodeNumber: session.nodeId || 0,
        nonStopText: false,
        bbsName: 'AmiExpress-Web BBS',
        sysopName: 'Sysop',
        timeRemaining: 60,
        doorCommand: doorInfo.command,
        doorName: doorInfo.name,
        dataDir: config.get('dataDir'),
        doorId: doorInfo.command || doorInfo.id
      }
    } as any);

    // Wire user input into the Amiga door while it runs
    session.inDoorManager = true;
    session.subState = LoggedOnSubState.DOOR_RUNNING;
    session.doorInputHandler = (data: string) => {
      try {
        const shared: any = (amigaSession as any).sharedState || {};
        logDoorDebug(`KEY door=${doorInfo.command || doorInfo.id || 'UNK'} data=${JSON.stringify(data)}`);
        if (shared.ximProtocol) {
          shared.ximProtocol.queueInput(data);
        }
        if (shared.dosLibrary && !(shared.ximProtocol?.isWaitingForLineInput?.() ?? false)) {
          shared.dosLibrary.queueInput(data);
        }
      } catch (err) {
        console.error('[launchAmigaDoor] Error routing door input:', err);
        SysopDebugUtil.debugDoorError(
          socket,
          session,
          doorInfo.command || doorInfo.id || 'Unknown',
          'Error routing door input',
          { error: (err as Error).message },
          DebugSeverity.WARNING
        );
      }
    };
    // Persist session state so socket-handlers sees the door flags/handler
    try {
      const { setSession, userSessions } = require('../server/session-manager');
      setSession(socket.id, session);
      if ((session as any).user?.id) {
        userSessions.set((session as any).user.id, session);
      }
    } catch (err) {
      console.error('[launchAmigaDoor] Unable to persist session for door input:', err);
      SysopDebugUtil.debugDoorError(
        socket,
        session,
        doorInfo.command || doorInfo.id || 'Unknown',
        'Unable to persist session for door input',
        { error: (err as Error).message },
        DebugSeverity.WARNING
      );
    }

    await amigaSession.start();

    // Log door exit
    DebugLogger.doorSuccess(socket.id, `Door exited: ${doorInfo.name || doorInfo.command}`);

    session.inDoorManager = false;
    delete session.doorInputHandler;
    session.subState = LoggedOnSubState.DISPLAY_MENU;
    try {
      const { setSession, userSessions } = require('../server/session-manager');
      setSession(socket.id, session);
      if ((session as any).user?.id) {
        userSessions.set((session as any).user.id, session);
      }
    } catch (_) {
      /* ignore */
    }

    console.log(`[launchAmigaDoor] Door session completed: ${doorInfo.command}`);

    // Capture any return/chain/PRV/ACP requests from the door
    if (typeof (amigaSession as any).getExitState === 'function') {
      const exitState = (amigaSession as any).getExitState();
      const ximState = exitState?.ximState || {};
      if (ximState.returnCommand) {
        (session as any).returnCommand = ximState.returnCommand;
        console.log(`[launchAmigaDoor] RETURNCOMMAND requested: ${ximState.returnCommand}`);
      }
      if (ximState.chainCommand) {
        (session as any).chainCommand = ximState.chainCommand;
        console.log(`[launchAmigaDoor] CHAIN requested: ${ximState.chainCommand}`);
      }
      if (ximState.prvCommand) {
        (session as any).prvCommand = ximState.prvCommand;
        console.log(`[launchAmigaDoor] PRV_COMMAND requested: ${ximState.prvCommand}`);
      }
      if ((exitState as any).bbsSession?.acpCommand) {
        (session as any).acpCommand = (exitState as any).bbsSession.acpCommand;
        console.log(
          `[launchAmigaDoor] ACP_COMMAND requested: ${
            (exitState as any).bbsSession.acpCommand.command || ''
          } (code=${(exitState as any).bbsSession.acpCommand.code}, target=${(exitState as any).bbsSession.acpCommand.targetNode})`
        );
      }

      // Execute requested commands immediately in priority order: CHAIN -> RETURN -> PRV -> ACP
      try {
        const { handleCommand } = require('./command.handler');
        const runCommand = async (cmd?: string) => {
          if (cmd && cmd.trim().length > 0) {
            await handleCommand(socket, session, cmd.trim());
          }
        };

        if ((session as any).chainCommand) {
          const cmd = (session as any).chainCommand;
          (session as any).chainCommand = undefined;
          (session as any).returnCommand = undefined;
          (session as any).prvCommand = undefined;
          (session as any).acpCommand = undefined;
          await runCommand(cmd);
        } else {
          if ((session as any).returnCommand) {
            const cmd = (session as any).returnCommand;
            (session as any).returnCommand = undefined;
            await runCommand(cmd);
          }
          if ((session as any).prvCommand) {
            const cmd = (session as any).prvCommand;
            (session as any).prvCommand = undefined;
            await runCommand(cmd);
          }
          const acp = (session as any).acpCommand;
          if (acp && acp.command) {
            (session as any).acpCommand = undefined;
            await runCommand(acp.command);
            applyAcpSideEffect(session, acp);
          }
        }
      } catch (err) {
        console.warn('[launchAmigaDoor] Failed to auto-run pending door commands:', err);
      }
    }

    // Return to menu
    session.subState = LoggedOnSubState.DISPLAY_MENU;
    session.menuPause = false;

  } catch (error) {
    console.error(`[launchAmigaDoor] Error executing door:`, error);
    SysopDebugUtil.debugDoorError(
      socket,
      session,
      doorInfo.command || doorInfo.id || 'Unknown',
      'Error executing 68K Amiga door',
      { doorPath: doorInfo.location, error: (error as Error).message, stack: (error as Error).stack },
      DebugSeverity.CRITICAL
    );
    socket.emit('ansi-output', `\r\n\x1b[31mError executing door: ${(error as Error).message}\x1b[0m\r\n`);
    socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
    session.menuPause = false;
    session.subState = LoggedOnSubState.DISPLAY_MENU;
  }
}

/**
 * Display door games menu (DOORS command)
 */
export async function displayDoorMenu(socket: any, session: BBSSession, params: string) {
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
  const availableAmigaDoors = amigaDoors.filter((door: any) =>
    door.installed &&
    (session.user?.secLevel || 0) >= (door.access || 0)
  );

  console.log(`[DOOR Command] Found ${availableDoors.length} TypeScript doors, ${availableAmigaDoors.length} Amiga doors`);

  // Convert Amiga doors to the format expected by this function
  const amigaDoorsList = availableAmigaDoors.map((door: any) => ({
    id: door.command,
    name: door.name || door.command,
    description: `${door.location} (${door.type})`,
    accessLevel: door.access || 0,
    enabled: true,
    conferenceId: null,
    isAmigaDoor: true,
    command: door.command,
    doorInfo: door  // Keep original door info for execution
  }));

  // Combine both lists
  const allDoors = [...availableDoors, ...amigaDoorsList];

  // If a door name was specified, try to launch it directly
  if (params && params.trim()) {
    const doorName = params.trim().toLowerCase();
    console.log(`[DOOR Command] Looking for door: ${doorName}`);

    const matchedDoor = allDoors.find(d =>
      d.id.toLowerCase() === doorName ||
      d.name.toLowerCase() === doorName ||
      (d.command && d.command.toLowerCase() === doorName)
    );

    if (matchedDoor) {
      console.log(`[DOOR Command] Found matching door: ${matchedDoor.name}`);

      // Check if it's an Amiga door
      if (matchedDoor.isAmigaDoor && matchedDoor.doorInfo) {
        console.log(`[DOOR Command] Launching Amiga door: ${matchedDoor.name}`);
        await launchAmigaDoor(socket, session, matchedDoor.doorInfo);
        return;
      } else {
        // TypeScript door
        await executeDoor(socket, session, matchedDoor);
        return;
      }
    } else {
      socket.emit('ansi-output', `\r\n\x1b[31mDoor "${params}" not found.\x1b[0m\r\n`);
      socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
      session.menuPause = false;
      session.subState = LoggedOnSubState.DISPLAY_MENU;
      return;
    }
  }

  // No door specified, show menu
  socket.emit('ansi-output', '\x1b[36m-= Door Games & Utilities =-\x1b[0m\r\n');

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

    // Display BBS command prominently
    if (door.command) {
      socket.emit('ansi-output', `   \x1b[0;36mCommand:\x1b[0m \x1b[33m${door.command}\x1b[0m\r\n`);
    }

    socket.emit('ansi-output', `   ${door.description}\r\n`);
    socket.emit('ansi-output', `   Access Level: ${door.accessLevel}\r\n\r\n`);
  });

  socket.emit('ansi-output', '\x1b[32mSelect door (1-\x1b[33m' + allDoors.length + '\x1b[32m) or press Enter to cancel: \x1b[0m');
  session.subState = LoggedOnSubState.DOOR_SELECT;
  session.tempData = { availableDoors: allDoors };
}

/**
 * Execute door game/utility
 */
export async function executeDoor(socket: any, session: BBSSession, door: Door) {
  console.log('Executing door:', door.name);

  // Check if this is a client door (needs to detect runtime from manifest)
  const doorManifest = await loadDoorManifestForExecution(door);
  if (doorManifest && (doorManifest.runtime === 'client' || doorManifest.runtime === 'hybrid')) {
    // Execute as client door (browser-based)
    await executeClientDoor(socket, session, door, doorManifest);
    return;
  }

  const nodeId = session.nodeId || 0;
  const { user: doorUser, isGuest } = resolveDoorExecutionUser(session);

  // Create drop files (DOOR.SYS, DORINFOx.DEF) before door execution
  const timeRemaining = session.timeRemaining || 3600; // Default 1 hour
  doorDropFileManager.createAllDropFiles(nodeId, doorUser, timeRemaining);

  // Create door session
  const doorSession: DoorSession = {
    doorId: door.id,
    userId: doorUser.id,
    startTime: new Date(),
    status: 'running'
  };
  doorSessions.push(doorSession);

  // Log door execution
  callersLog(isGuest ? null : doorUser.id, doorUser.username, 'Executed door', door.name);
  callersLogManager.logDoor(nodeId, door.name);

  // Execute based on door type
  switch (door.type) {
    case 'MCI': // MCI door - process MCI codes and display (express.e:4293-4297)
      await executeMciDoor(socket, session, door, doorSession);
      break;
    case 'TS': // TypeScript door type from BBSCMD file
    case 'typescript': // TypeScript door with runDoor() export
      await executeTypeScriptDoor(socket, session, door, doorSession);
      break;
    case 'SDK': // SDK door with Door wrapper class (separate process)
      await executeSDKDoor(socket, session, door, doorSession);
      break;
    case 'python': // Python door
    case 'PY': // Python door type from BBSCMD file
      await executePythonDoor(socket, session, door, doorSession);
      break;
    case 'arexx': // ARexx door
    case 'AREXX': // ARexx door type from BBSCMD file
    case 'REXX': // REXX door type from BBSCMD file
      await executeARexxDoor(socket, session, door, doorSession);
      break;
    case 'web':
      await executeWebDoor(socket, session, door, doorSession);
      break;
    case 'native':
      // Web version: Execute Node.js scripts instead of Amiga native executables
      await executeNativeDoor(socket, session, door, doorSession);
      break;
    case 'script':
      // Web version: Execute shell scripts
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
      SysopDebugUtil.debugDoorError(
        socket,
        session,
        door.name,
        `Unknown door type: ${door.type}`,
        { doorType: door.type, doorPath: door.path },
        DebugSeverity.CRITICAL
      );
  }

  // Clean up drop files after door exit
  doorDropFileManager.cleanupDropFiles(nodeId);
  callersLogManager.logDoorExit(nodeId, door.name);

  // Mark session as completed
  doorSession.endTime = new Date();
  doorSession.status = 'completed';

  // After door completes, return to menu (express.e behavior after doors)
  // Set subState so PROCESS_COMMAND handler knows door is done
  session.menuPause = false;
  session.subState = LoggedOnSubState.DISPLAY_MENU;
}

/**
 * Execute TypeScript door with runDoor() export
 * Dynamically imports the door module and calls its runDoor() function
 */
async function executeTypeScriptDoor(socket: any, session: BBSSession, door: Door, doorSession: DoorSession): Promise<void> {
  console.log(`[executeTypeScriptDoor] Starting TypeScript door: ${door.name}`);
  console.log(`[executeTypeScriptDoor] Door path: ${door.path}`);

  try {
    // Build absolute path to door - handle both directory and file paths
    let doorPath = door.path;

    // If path is undefined, error out
    if (!doorPath) {
      socket.emit('ansi-output', `\r\n\x1b[31mDoor path is not configured\x1b[0m\r\n`);
      socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
      session.menuPause = false;
      session.subState = LoggedOnSubState.DISPLAY_MENU;
      return;
    }

    // Get BBS root directory (use BBS_ROOT env var or default to project root)
    const projectRoot = process.env.BBS_ROOT || path.resolve(process.cwd(), '../..');

    // If path is a directory, append index.ts
    if (fs.existsSync(path.join(projectRoot, doorPath)) &&
        fs.statSync(path.join(projectRoot, doorPath)).isDirectory()) {
      doorPath = path.join(doorPath, 'index.ts');
    }

    // Build absolute path from project root
    doorPath = path.isAbsolute(doorPath)
      ? doorPath
      : path.join(projectRoot, doorPath);

    console.log(`[executeTypeScriptDoor] Resolved path: ${doorPath}`);

    // Check if door exists
    if (!fs.existsSync(doorPath)) {
      socket.emit('ansi-output', `\r\n\x1b[31mDoor not found: ${doorPath}\x1b[0m\r\n`);
      socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
      session.menuPause = false;
      session.subState = LoggedOnSubState.DISPLAY_MENU;
      return;
    }

    // Dynamically import the door module with cache busting for development
    // Use timestamp query parameter to force fresh load every time
    const cacheBuster = `?t=${Date.now()}`;
    const doorModule = await import(`${doorPath}${cacheBuster}`);

    if (typeof doorModule.runDoor !== 'function') {
      socket.emit('ansi-output', `\r\n\x1b[31mInvalid TypeScript door: No runDoor() export found\x1b[0m\r\n`);
      socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
      session.menuPause = false;
      session.subState = LoggedOnSubState.DISPLAY_MENU;
      return;
    }

    disableShortcuts(session);
    console.log(`[executeTypeScriptDoor] Door module loaded, calling runDoor()`);

    // Set door active flag - this blocks command handler but door can still receive events
    session.inDoorManager = true;
    console.log(`[executeTypeScriptDoor] Set inDoorManager=true`);

    // Notify frontend that door is active
    socket.emit('door:status', { status: 'running' });
    console.log(`[executeTypeScriptDoor] Sent door:status: running`);

    // Create BBS API instance for door
    const { createBBSApi } = require('../doors/BBSApi');
    const bbsApi = createBBSApi(socket, session);

    // Create door session object with reference to BBS session and API
    const doorSessionObj = {
      socket,
      user: session.user,
      bbsSession: session,  // Pass reference to BBS session for input routing
      bbs: bbsApi,          // BBS API with all functions
      params: door.parameters || []  // Pass command-line parameters from .info PARAMS
    };

    // Execute the door (it registers its own input listeners)
    console.log(`[executeTypeScriptDoor] Calling door's runDoor() function...`);
    await doorModule.runDoor(doorSessionObj);
    console.log(`[executeTypeScriptDoor] Door's runDoor() returned`);

    console.log(`[executeTypeScriptDoor] Door completed successfully`);

    // Clear door active flag
    delete session.inDoorManager;
    console.log(`[executeTypeScriptDoor] Cleared inDoorManager`);

    // Reset menu input mode (express.e returns to MENU with shortcuts off)
    session.cmdShortcuts = false;
    if (session.shortcuts?.clear) {
      session.shortcuts.clear();
    }

    // Notify frontend that door is stopped
    socket.emit('door:status', { status: 'stopped' });
    console.log(`[executeTypeScriptDoor] Sent door:status: stopped`);

    // Return to menu and pause before showing
    session.menuPause = true;
    session.subState = LoggedOnSubState.DISPLAY_MENU;

  } catch (error) {
    console.error(`[executeTypeScriptDoor] Error executing TypeScript door:`, error);
    SysopDebugUtil.debugDoorError(
      socket,
      session,
      door.name,
      'Error executing TypeScript door',
      { doorPath: door.path, error: (error as Error).message, stack: (error as Error).stack },
      DebugSeverity.CRITICAL
    );

    // Clear door active flag on error
    delete session.inDoorManager;
    session.cmdShortcuts = false;
    if (session.shortcuts?.clear) {
      session.shortcuts.clear();
    }

    socket.emit('ansi-output', `\r\n\x1b[31mError executing door: ${(error as Error).message}\x1b[0m\r\n`);
    socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
    session.menuPause = true;
    session.subState = LoggedOnSubState.DISPLAY_MENU;
  }
}

/**
 * Execute SDK door as separate Node.js process
 * Uses child_process.fork() to spawn SDK door with Door wrapper class
 * Bridges Door events to Socket.IO for real-time communication
 */
async function executeSDKDoor(socket: any, session: BBSSession, door: Door, doorSession: DoorSession): Promise<void> {
  console.log(`[executeSDKDoor] Starting SDK door: ${door.name}`);
  console.log(`[executeSDKDoor] Door path: ${door.path}`);
  disableShortcuts(session);

  try {
    // Build absolute path to door
    let doorPath = door.path;

    if (!doorPath) {
      socket.emit('ansi-output', `\r\n\x1b[31mDoor path is not configured\x1b[0m\r\n`);
      socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
      session.menuPause = false;
      session.subState = LoggedOnSubState.DISPLAY_MENU;
      return;
    }

    // Get BBS root directory (use BBS_ROOT env var or default to project root)
    const projectRoot = process.env.BBS_ROOT || path.resolve(process.cwd(), '../..');

    // If path is a directory, append index.js (compiled)
    if (fs.existsSync(path.join(projectRoot, doorPath)) &&
        fs.statSync(path.join(projectRoot, doorPath)).isDirectory()) {
      // Try compiled version first, fall back to TypeScript
      const compiledPath = path.join(doorPath, 'dist', 'index.js');
      const tsPath = path.join(doorPath, 'index.ts');

      if (fs.existsSync(path.join(projectRoot, compiledPath))) {
        doorPath = compiledPath;
      } else if (fs.existsSync(path.join(projectRoot, tsPath))) {
        doorPath = tsPath;
      } else {
        doorPath = path.join(doorPath, 'index.js');
      }
    }

    // Build absolute path
    doorPath = path.isAbsolute(doorPath)
      ? doorPath
      : path.join(projectRoot, doorPath);

    console.log(`[executeSDKDoor] Resolved path: ${doorPath}`);

    // Check if door exists
    if (!fs.existsSync(doorPath)) {
      socket.emit('ansi-output', `\r\n\x1b[31mDoor not found: ${doorPath}\x1b[0m\r\n`);
      socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
      session.menuPause = false;
      session.subState = LoggedOnSubState.DISPLAY_MENU;
      return;
    }

    const { user: sdkUser } = resolveDoorExecutionUser(session);

    // Prepare user data for SDK door
    const userData = {
      id: sdkUser.id,
      name: sdkUser.username,
      node: session.nodeId || 1,
      securityLevel: sdkUser.secLevel,
      timeLeft: session.timeRemaining || 3600,
      graphicsMode: sdkUser.ansi ? 'ANSI' : 'ASCII',
      termWidth: session.screenWidth || 80,
      termHeight: session.screenHeight || 24,
      data: {}
    };

    console.log(`[executeSDKDoor] Forking child process...`);

    // Fork child process for SDK door
    // If it's a TypeScript file, use tsx to run it
    const isTypeScript = doorPath.endsWith('.ts');
    const forkOptions: any = {
      cwd: path.dirname(doorPath),
      env: {
        ...process.env,
        SDK_MODE: '1',
        BBS_USER_DATA: JSON.stringify(userData)
      },
      silent: true, // Capture stdout/stderr
      stdio: ['pipe', 'pipe', 'pipe', 'ipc']
    };

    // Add tsx loader for TypeScript files
    if (isTypeScript) {
      forkOptions.execArgv = ['--import', 'tsx'];
    }

    const childProcess = fork(doorPath, [], forkOptions);

    console.log(`[executeSDKDoor] Child process spawned with PID: ${childProcess.pid}`);

    let doorRunning = true;

    // Handle Door output events via IPC
    childProcess.on('message', (message: any) => {
      if (message.type === 'output') {
        // Door emitted output event - send to user
        socket.emit('ansi-output', message.text);
      } else if (message.type === 'disconnect') {
        // Door requested disconnect
        console.log('[executeSDKDoor] Door requested disconnect');
        doorRunning = false;
        childProcess.kill();
      }
    });

    // Handle stdout (fallback if not using IPC)
    if (childProcess.stdout) {
      childProcess.stdout.on('data', (data: Buffer) => {
        socket.emit('ansi-output', data.toString());
      });
    }

    // Handle stderr
    if (childProcess.stderr) {
      childProcess.stderr.on('data', (data: Buffer) => {
        console.error(`[executeSDKDoor] stderr: ${data.toString()}`);
      });
    }

    // Forward user input to SDK door
    const inputHandler = (data: string) => {
      if (doorRunning && childProcess && !childProcess.killed) {
        // Send input to door via IPC
        childProcess.send({
          type: 'input',
          key: {
            key: data,
            ctrl: data.charCodeAt(0) < 32,
            alt: false,
            shift: false,
            code: data.charCodeAt(0)
          }
        });
      }
    };

    socket.on('user-input', inputHandler);

    // Handle door disconnect
    const disconnectHandler = () => {
      console.log('[executeSDKDoor] User disconnected');
      doorRunning = false;
      if (childProcess && !childProcess.killed) {
        childProcess.send({ type: 'disconnect' });
        setTimeout(() => {
          if (!childProcess.killed) {
            childProcess.kill();
          }
        }, 1000);
      }
    };

    socket.once('disconnect', disconnectHandler);

    // Wait for door to exit
    await new Promise<void>((resolve) => {
      childProcess.on('exit', (code) => {
        console.log(`[executeSDKDoor] Child process exited with code: ${code}`);
        doorRunning = false;
        socket.off('user-input', inputHandler);
        socket.off('disconnect', disconnectHandler);
        resolve();
      });

      childProcess.on('error', (err) => {
        console.error(`[executeSDKDoor] Child process error:`, err);
        doorRunning = false;
        socket.off('user-input', inputHandler);
        socket.off('disconnect', disconnectHandler);
        resolve();
      });
    });

    console.log('[executeSDKDoor] Door execution completed');

    // Reset flags and return to menu
    delete session.inDoorManager;
    session.cmdShortcuts = false;
    if (session.shortcuts?.clear) {
      session.shortcuts.clear();
    }
    session.menuPause = true;
    session.subState = LoggedOnSubState.DISPLAY_MENU;

  } catch (error) {
    console.error('[executeSDKDoor] Error:', error);
    socket.emit('ansi-output', `\r\n\x1b[31mError executing SDK door: ${(error as Error).message}\x1b[0m\r\n`);
    socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
    session.cmdShortcuts = false;
    if (session.shortcuts?.clear) {
      session.shortcuts.clear();
    }
    session.menuPause = true;
    session.subState = LoggedOnSubState.DISPLAY_MENU;
  }
}

/**
 * Execute Amiga door via 68000 CPU emulation
 * Handles XIM, AIM, SIM, TIM, IIM door types
 */
async function executeAmigaDoor(socket: any, session: BBSSession, door: any, doorSession: DoorSession) {
  console.log(`[executeAmigaDoor] Starting Amiga door: ${door.name} (${door.type})`);
  console.log(`[executeAmigaDoor] Path: ${door.path}`);
  disableShortcuts(session);

  try {
    // Get the BBS root from AmigaDoorManager (same location where doors are installed)
    const { getAmigaDoorManager } = require('../doors/amigaDoorManager');
    const amigaDoorMgr = getAmigaDoorManager();
    const bbsRoot = amigaDoorMgr.bbsRoot;

    // Build the full path to the door executable with case-insensitive resolution
    // door.path is already converted from Amiga paths (e.g., "Doors/AquaBulls/AquaBulls")
    const normalizedDoorComponents = door.path
      .replace(/\\/g, '/')
      .split('/')
      .filter((component: string) => component.length > 0);

    let doorPath =
      resolveCaseInsensitivePath(bbsRoot, normalizedDoorComponents) ||
      path.join(bbsRoot, door.path);

    console.log(`[executeAmigaDoor] BBS root: ${bbsRoot}`);
    console.log(`[executeAmigaDoor] Initial door path: ${doorPath}`);

    // Check if door executable exists - if not, try alternate paths
    if (!fs.existsSync(doorPath)) {
      console.log(`[executeAmigaDoor] Door not found at ${doorPath}, trying alternate paths...`);

      // Try alternate path resolutions for common issues:
      const location = door.path;
      const alternatePaths = [];

      // 1. Try with capital D in Doors/ (doors/  Doors/)
      if (/^doors\//i.test(location)) {
        alternatePaths.push(path.join(bbsRoot, location.replace(/^doors\//i, 'Doors/')));
      }


      // 3. Try adding Doors/ prefix if missing
      if (!/^doors\//i.test(location)) {
        alternatePaths.push(path.join(bbsRoot, 'Doors', location));
      }

      // 4. Try case-insensitive matching in Doors/ directory
      // This handles: glc/glcviewer vs glcviewer/glcviewer, Bossnuke vs BossNuke/BossNuke
      const basename = path.basename(location);
      const dirname = path.dirname(location);

      // Try variations: exact name, lowercase, first char uppercase
      const nameVariations = [
        basename,
        basename.toLowerCase(),
        basename.charAt(0).toUpperCase() + basename.slice(1).toLowerCase()
      ];

      // Search in Doors/ directory
      const doorsDir =
        resolveCaseInsensitivePath(bbsRoot, ['Doors']) ||
        resolveCaseInsensitivePath(bbsRoot, ['doors']);

      if (doorsDir && fs.existsSync(doorsDir)) {
        try {
          const entries = fs.readdirSync(doorsDir);
          for (const entry of entries) {
            const entryPath = path.join(doorsDir, entry);
            const stat = fs.statSync(entryPath);

            if (stat.isDirectory()) {
              // Check if this directory name matches any variation of the door name
              const entryLower = entry.toLowerCase();
              const basenameLower = basename.toLowerCase();

              if (entryLower === basenameLower || entryLower.includes(basenameLower)) {
                // Try the executable inside this directory
                for (const nameVar of nameVariations) {
                  const execPath = path.join(entryPath, nameVar);
                  if (fs.existsSync(execPath)) {
                    alternatePaths.push(execPath);
                  }
                }
              }
            }
          }
        } catch (e) {
          console.error(`[executeAmigaDoor] Error scanning Doors directory:`, e);
        }
      }

      // Search for the file in alternate locations
      for (const altPath of alternatePaths) {
        if (fs.existsSync(altPath)) {
          console.log(`[executeAmigaDoor] Found door at alternate path: ${altPath}`);
          doorPath = altPath;
          break;
        }
      }

      // If still not found, error out
      if (!fs.existsSync(doorPath)) {
        console.error(`[executeAmigaDoor] Door executable not found: ${doorPath}`);
        console.error(`[executeAmigaDoor] Tried alternate paths:`, alternatePaths);
        socket.emit('ansi-output', '\r\n\x1b[31mDoor executable not found.\x1b[0m\r\n');
        socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
        return;
      }
    }

    console.log(`[executeAmigaDoor] Starting 68k emulation for: ${doorPath}`);

    // Create DoorConfig for AmigaDoorSession
    // TEMPORARY FIX: Force RTW as XIM door (it explicitly declares itself as XIM in banner)
    let doorType = door.type || 'SIM';  // Default to SIM per express.e:4681
    if (doorPath.toLowerCase().includes('/rtw/rtw') || doorPath.toLowerCase().includes('\\rtw\\rtw')) {
      doorType = 'XIM';
      console.log(`[executeAmigaDoor] RTW detected - forcing XIM door type`);
    }

    // Build CLI arguments - XIM doors typically expect node number as first arg
    const nodeNumber = session.nodeId || 1;
    const doorArgs: string[] = [];

    // Add node number as first argument for XIM doors (required by most XIM doors like AquaScan)
    if (doorType === 'XIM') {
      doorArgs.push(nodeNumber.toString());
    }

    // Add ARGS from .info file (e.g., ARGS=REVSCAN for AquaScan)
    if (door.args) {
      doorArgs.push(...door.args.split(' ').filter((a: string) => a));
    }

    // Add any additional arguments from door.passParameters
    if (door.passParameters && typeof door.passParameters === 'string') {
      doorArgs.push(...door.passParameters.split(' ').filter((a: string) => a));
    }

    // Add doorCommand and doorId to session for XIMProtocol to access
    // XIMProtocol uses these to respond to GET_CUSTOM_MSGBASE_MENUCMD (525)
    console.log(`[executeAmigaDoor] Setting doorCommand="${door.command}" on session`);
    (session as any).doorCommand = door.command;
    (session as any).doorId = door.command;
    console.log(`[executeAmigaDoor] Verified session.doorCommand="${(session as any).doorCommand}"`);

    // Set bbsRoot on session so XIMProtocol can find command .info files
    (session as any).bbsRoot = bbsRoot;
    (session as any).dataDir = bbsRoot;
    console.log(`[executeAmigaDoor] Set session.bbsRoot="${bbsRoot}" for XIMProtocol`);

    // Interactive doors need guard disabled - they legitimately wait for user input
    // Batch doors (run via batch-scheduler) use LOOP_LIMIT instead
    const interactiveToolTypes = {
      ...door.toolTypes,
      DISABLE_GUARD: 'true'
    };

    const doorConfig = {
      executablePath: doorPath,
      doorType: doorType,
      doorId: door.command,  // Command name (e.g., "FR") for GET_CMD_TOOLTYPE
      timeout: 300, // 5 minutes
      bbsSession: session, // Use session's actual nodeId assigned by getNextAvailableNodeId()
      args: doorArgs, // CLI arguments for the door
      stack: door.stack,
      priority: door.priority,
      resident: door.resident,
      expertMode: door.expertMode,
      trapOn: door.trapOn,
      silent: door.silent,
      quickMode: door.quickMode,
      multiNode: door.multiNode,
      logInputs: door.logInputs,
      scriptCheck: door.scriptCheck,
      banner: door.banner,
      mimicVer: door.mimicVer,
      passParameters: door.passParameters,
      internal: door.internal,
      toolTypes: interactiveToolTypes
    };

    // Create AmigaDoorSession to run the native Amiga executable
    const amigaSession = new AmigaDoorSession(socket, doorConfig);

    // Move to a fresh line before the door renders any output (prevents menu prompt overlap)
    socket.emit('ansi-output', '\r\n');

    // Wire user input into the Amiga door while it runs
    session.inDoorManager = true;
    session.subState = LoggedOnSubState.DOOR_RUNNING;
    session.doorInputHandler = (data: string) => {
      try {
        const shared: any = (amigaSession as any).sharedState || {};
        logDoorDebug(
          `KEY door=${door.command || door.id || 'UNK'} data=${JSON.stringify(
            data
          )}`
        );
        if (shared.ximProtocol) {
          shared.ximProtocol.queueInput(data);
        }
        if (
          shared.dosLibrary &&
          !(shared.ximProtocol?.isWaitingForLineInput?.() ?? false)
        ) {
          shared.dosLibrary.queueInput(data);
        }
      } catch (err) {
        console.error('[executeAmigaDoor] Error routing door input:', err);
      }
    };
    // Persist session state so socket-handlers sees the door flags/handler
    try {
      const { setSession, userSessions } = require('../server/session-manager');
      setSession(socket.id, session);
      if ((session as any).user?.id) {
        userSessions.set((session as any).user.id, session);
      }
    } catch (err) {
      console.error('[executeAmigaDoor] Unable to persist session for door input:', err);
    }

    // Start the door execution
    await amigaSession.start();

    console.log(`[executeAmigaDoor] Door execution completed`);

    session.inDoorManager = false;
    delete session.doorInputHandler;
    session.subState = LoggedOnSubState.DISPLAY_MENU;
    try {
      const { setSession, userSessions } = require('../server/session-manager');
      setSession(socket.id, session);
      if ((session as any).user?.id) {
        userSessions.set((session as any).user.id, session);
      }
    } catch {
      /* ignore */
    }

  } catch (error) {
    console.error(`[executeAmigaDoor] Error executing Amiga door:`, error);
    socket.emit('ansi-output', `\r\n\x1b[31mError executing door: ${(error as Error).message}\x1b[0m\r\n`);
    session.inDoorManager = false;
    delete session.doorInputHandler;
    try {
      const { setSession, userSessions } = require('../server/session-manager');
      setSession(socket.id, session);
      if ((session as any).user?.id) {
        userSessions.set((session as any).user.id, session);
      }
    } catch {
      /* ignore */
    }
    session.subState = LoggedOnSubState.DISPLAY_MENU;
  }
}

/**
 * Execute MCI door - displays text with MCI codes processed
 * Based on express.e:4293-4297
 *
 * MCI doors don't execute a program - they just display text with MCI codes.
 * The MCI_TEXT tooltype contains the text to display with codes like ~CL., ~N|, etc.
 */
async function executeMciDoor(socket: any, session: BBSSession, door: Door, doorSession: DoorSession) {
  console.log(`[executeMciDoor] Processing MCI door: ${door.name}`);

  if (!door.mciText) {
    console.error(`[executeMciDoor] No MCI_TEXT found for door: ${door.name}`);
    socket.emit('ansi-output', '\r\n\x1b[31mMCI door has no text to display.\x1b[0m\r\n');
    socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
    session.subState = LoggedOnSubState.DISPLAY_MENU;
    return;
  }

  // Import parseMciCodes function
  const { parseMciCodes, addAnsiEscapes } = require('./screen.handler');

  // Convert escape sequences in MCI_TEXT to actual characters
  // Replace literal \r\n, \r, \n with actual CRLF
  let mciText = door.mciText
    .replace(/\\r\\n/g, '\r\n')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r');

  // Process MCI codes (express.e:4297 calls processMci())
  let processedText = parseMciCodes(mciText, session);

  // Add ESC prefix to ANSI codes if needed
  processedText = addAnsiEscapes(processedText);

  // Normalize line endings
  processedText = processedText.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');

  // Display the processed text
  socket.emit('ansi-output', processedText);

  // Pause after display
  socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
  session.menuPause = false;
  session.subState = LoggedOnSubState.DISPLAY_MENU;

  console.log(`[executeMciDoor] MCI door completed: ${door.name}`);
}

/**
 * Execute web-compatible door (ported AmiExpress doors)
 */
async function executeWebDoor(socket: any, session: BBSSession, door: Door, doorSession: DoorSession) {
  disableShortcuts(session);
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
  console.log(` [DOOR] Executing native door: ${door.name} (${door.path})`);
  disableShortcuts(session);

  // Check if door file exists
  const doorPath = path.isAbsolute(door.path) ? door.path : path.join(process.cwd(), door.path);

  if (!fs.existsSync(doorPath)) {
    socket.emit('ansi-output', `\r\n\x1b[31mError: Door file not found: ${door.path}\x1b[0m\r\n`);
    socket.emit('ansi-output', '\x1b[33mPlease contact the sysop.\x1b[0m\r\n\r\n');
    doorSession.status = 'error';
    return;
  }

  //  HISTORIC MOMENT: Check if this is an Amiga binary!
  if (isAmigaBinary(doorPath)) {
    console.log(' [AMIGA DOOR] Detected Amiga binary! Starting 68k emulation...');

    try {
      const amigaSession = new AmigaDoorSession(socket, {
        executablePath: doorPath,
        timeout: 600,  // 10 minutes
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
  console.log(` [DOOR] Executing script door: ${door.name} (${door.path})`);
  disableShortcuts(session);

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
 * Execute Python door
 * Runs Python scripts with full BBS environment variables
 */
async function executePythonDoor(socket: any, session: BBSSession, door: Door, doorSession: DoorSession): Promise<void> {
  console.log(`[executePythonDoor] Starting Python door: ${door.name}`);
  console.log(`[executePythonDoor] Door path: ${door.path}`);
  disableShortcuts(session);

  // Check if door script exists
  const doorPath = path.isAbsolute(door.path) ? door.path : path.join(process.cwd(), door.path);

  if (!fs.existsSync(doorPath)) {
    socket.emit('ansi-output', `\r\n\x1b[31mError: Python script not found: ${door.path}\x1b[0m\r\n`);
    socket.emit('ansi-output', '\x1b[33mPlease contact the sysop.\x1b[0m\r\n\r\n');
    doorSession.status = 'error';
    return;
  }

  // Get node ID from session
  const nodeId = session.nodeId || 1;

  // Calculate time remaining
  const timeRemaining = session.timeRemaining || 60;

  const { user: pythonDoorUser } = resolveDoorExecutionUser(session);

  // Create drop files for the door
  doorDropFileManager.createAllDropFiles(nodeId, pythonDoorUser, timeRemaining);

  // Get drop file directory path
  const config = require('../config').config;
  const bbsRoot = config.get('dataDir');
  const dropFileDir = path.join(bbsRoot, `Node${nodeId}`);

  // Prepare comprehensive environment variables for Python script
  const env = {
    ...process.env,
    // User information
    BBS_USERNAME: pythonDoorUser.username,
    BBS_USER_ID: pythonDoorUser.id,
    BBS_REALNAME: pythonDoorUser.realname,
    BBS_LOCATION: pythonDoorUser.location,
    BBS_SECURITY_LEVEL: pythonDoorUser.secLevel.toString(),
    // Door information
    BBS_DOOR_ID: door.id,
    BBS_DOOR_NAME: door.name,
    BBS_NODE: nodeId.toString(),
    // Drop file paths
    BBS_DROP_DIR: dropFileDir,
    BBS_DOOR_SYS: path.join(dropFileDir, 'DOOR.SYS'),
    BBS_DOOR32_SYS: path.join(dropFileDir, 'DOOR32.SYS'),
    BBS_DORINFO_DEF: path.join(dropFileDir, `DORINFO${nodeId}.DEF`),
    // Conference information
    BBS_CONFERENCE: session.currentConf?.toString() || '1',
    BBS_CONFERENCE_NAME: session.currentConfName || 'General',
    // Time information
    BBS_TIME_REMAINING: timeRemaining.toString(),
    BBS_TIME_ONLINE: Math.floor((Date.now() - session.loginTime) / 60000).toString()
  };

  try {
    // Execute Python script
    const pythonProcess = spawn('python3', [doorPath, ...(door.parameters || [])], {
      env,
      cwd: path.dirname(doorPath)
    });

    // Capture stdout and send to user
    pythonProcess.stdout.on('data', (data: Buffer) => {
      const output = data.toString();
      socket.emit('ansi-output', output);

      // Store in door session history
      if (!doorSession.output) doorSession.output = [];
      doorSession.output.push(output);
    });

    // Capture stderr
    pythonProcess.stderr.on('data', (data: Buffer) => {
      const error = data.toString();
      console.error(`[Python Door ${door.id}] Error:`, error);
      socket.emit('ansi-output', `\x1b[31m${error}\x1b[0m`);
    });

    // Allow user input to Python script via stdin
    const userInputHandler = (input: string) => {
      pythonProcess.stdin.write(input);
    };

    // Register input handler in session
    session.doorInputHandler = userInputHandler;

    // Wait for door to complete
    await new Promise<void>((resolve, reject) => {
      pythonProcess.on('close', (code: number) => {
        console.log(`[Python Door ${door.id}] Exited with code ${code}`);

        // Clean up input handler
        delete session.doorInputHandler;

        if (code === 0) {
          socket.emit('ansi-output', `\r\n\r\n\x1b[32m${door.name} completed.\x1b[0m\r\n`);
          resolve();
        } else {
          socket.emit('ansi-output', `\r\n\r\n\x1b[31m${door.name} exited with error code ${code}.\x1b[0m\r\n`);
          doorSession.status = 'error';
          resolve();
        }
      });

      pythonProcess.on('error', (err: Error) => {
        console.error(`[Python Door ${door.id}] Spawn error:`, err);
        socket.emit('ansi-output', `\r\n\x1b[31mError executing Python script: ${err.message}\x1b[0m\r\n`);
        doorSession.status = 'error';

        // Clean up input handler
        delete session.doorInputHandler;

        reject(err);
      });

      // Timeout after 30 minutes
      setTimeout(() => {
        pythonProcess.kill();
        socket.emit('ansi-output', '\r\n\x1b[31mPython door timeout (30 minutes).\x1b[0m\r\n');
        doorSession.status = 'error';

        // Clean up input handler
        delete session.doorInputHandler;

        resolve();
      }, 1800000);
    });

  } catch (error: any) {
    console.error(`[Python Door ${door.id}] Execution error:`, error);
    socket.emit('ansi-output', `\r\n\x1b[31mError: ${error.message}\x1b[0m\r\n`);
    doorSession.status = 'error';
  }

  socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
  session.menuPause = false;
  session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
}

/**
 * Execute ARexx door
 * Emulates ARexx script execution using a JavaScript ARexx interpreter
 * In AmiExpress, AREXX doors interact with the BBS via ARexx port commands
 */
async function executeARexxDoor(socket: any, session: BBSSession, door: Door, doorSession: DoorSession): Promise<void> {
  console.log(`[executeARexxDoor] Starting ARexx door: ${door.name}`);
  console.log(`[executeARexxDoor] Door path: ${door.path}`);
  disableShortcuts(session);

  // Check if door script exists
  const doorPath = path.isAbsolute(door.path) ? door.path : path.join(process.cwd(), door.path);

  if (!fs.existsSync(doorPath)) {
    socket.emit('ansi-output', `\r\n\x1b[31mError: ARexx script not found: ${door.path}\x1b[0m\r\n`);
    socket.emit('ansi-output', '\x1b[33mPlease contact the sysop.\x1b[0m\r\n\r\n');
    doorSession.status = 'error';
    return;
  }

  try {
    // Import ARexx engine from arexx.ts
    const { arexxEngine } = require('../arexx');

  // Get node ID from session
  const nodeId = session.nodeId || 1;

  // Calculate time remaining
  const timeRemaining = session.timeRemaining || 60;

  const { user: arexxDoorUser } = resolveDoorExecutionUser(session);

  // Create drop files for the door
  doorDropFileManager.createAllDropFiles(nodeId, arexxDoorUser, timeRemaining);

    // Get drop file directory path
    const config = require('../config').config;
    const bbsRoot = config.get('dataDir');
    const dropFileDir = path.join(bbsRoot, `Node${nodeId}`);

    // Create BBS API instance for ARexx door
    const { createBBSApi } = require('../doors/BBSApi');
    const bbsApi = createBBSApi(socket, session);

    // Prepare ARexx context with BBS environment and full API
    const arexxContext = {
      // User information
      username: arexxDoorUser.username,
      userId: arexxDoorUser.id,
      realname: arexxDoorUser.realname,
      location: arexxDoorUser.location,
      securityLevel: arexxDoorUser.secLevel,
      // Door information
      doorId: door.id,
      doorName: door.name,
      nodeId: nodeId,
      // Drop file paths
      dropDir: dropFileDir,
      doorSys: path.join(dropFileDir, 'DOOR.SYS'),
      door32Sys: path.join(dropFileDir, 'DOOR32.SYS'),
      dorinfodef: path.join(dropFileDir, `DORINFO${nodeId}.DEF`),
      // Conference information
      conference: session.currentConf || 1,
      conferenceName: session.currentConfName || 'General',
      // Time information
      timeRemaining: timeRemaining,
      timeOnline: Math.floor((Date.now() - session.loginTime) / 60000),

      // === BBS API FUNCTIONS (Full Feature Parity) ===

      // Output functions
      output: (text: string) => {
        socket.emit('ansi-output', text);
        if (!doorSession.output) doorSession.output = [];
        doorSession.output.push(text);
      },
      write: (text: string) => bbsApi.write(text),
      writeLine: (text: string) => bbsApi.writeLine(text),
      clearScreen: () => bbsApi.clearScreen(),
      moveCursor: (row: number, col: number) => bbsApi.moveCursor(row, col),
      setColor: (colorCode: number) => bbsApi.setColor(colorCode),

      // Input functions
      input: (prompt: string): Promise<string> => {
        return new Promise((resolve) => {
          socket.emit('ansi-output', prompt);

          const inputHandler = (data: string) => {
            delete session.doorInputHandler;
            resolve(data);
          };

          session.doorInputHandler = inputHandler;
        });
      },
      getLine: (prompt?: string, maxLength?: number) => bbsApi.getLine(prompt, maxLength),
      getKey: (prompt?: string) => bbsApi.getKey(prompt),
      hotkey: (options: string[], prompt?: string) => bbsApi.hotkey(options, prompt),

      // User data functions
      getUser: () => bbsApi.getUser(),
      getUserSecLevel: () => bbsApi.getUserSecLevel(),
      getTimeRemaining: () => bbsApi.getTimeRemaining(),
      getTimeOnline: () => bbsApi.getTimeOnline(),

      // Conference functions
      getCurrentConference: () => bbsApi.getCurrentConference(),
      getCurrentConferenceName: () => bbsApi.getCurrentConferenceName(),
      joinConference: (confNum: number) => bbsApi.joinConference(confNum),
      listConferences: () => bbsApi.listConferences(),

      // Node/system functions
      getNodeNumber: () => bbsApi.getNodeNumber(),
      getSystemInfo: () => bbsApi.getSystemInfo(),
      getNodes: () => bbsApi.getNodes(),

      // File I/O functions
      readFile: (filename: string) => bbsApi.readFile(filename),
      writeFile: (filename: string, content: string) => bbsApi.writeFile(filename, content),
      fileExists: (filename: string) => bbsApi.fileExists(filename),
      listFiles: (directory: string, pattern?: string) => bbsApi.listFiles(directory, pattern),

      // Message functions
      sendMessage: (toUsername: string, subject: string, body: string) => bbsApi.sendMessage(toUsername, subject, body),
      postMessage: (subject: string, body: string) => bbsApi.postMessage(subject, body),

      // Utility functions
      logActivity: (action: string, details?: string) => bbsApi.logActivity(action, details),
      displayFile: (filename: string) => bbsApi.displayFile(filename),
      pause: (prompt?: string) => bbsApi.pause(prompt),
      displayMCI: (text: string) => bbsApi.displayMCI(text)
    };

    // Execute ARexx script through the ARexx engine
    console.log(`[executeARexxDoor] Executing script: ${doorPath}`);
    await arexxEngine.executeScript(doorPath, arexxContext);

    socket.emit('ansi-output', `\r\n\r\n\x1b[32m${door.name} completed.\x1b[0m\r\n`);

  } catch (error: any) {
    console.error(`[ARexx Door ${door.id}] Execution error:`, error);
    socket.emit('ansi-output', `\r\n\x1b[31mError executing ARexx script: ${error.message}\x1b[0m\r\n`);
    doorSession.status = 'error';
  }

  socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
  session.menuPause = false;
  session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
}

/**
 * Initialize door collection
 * Converts CommandDefinition objects from BBSCMD into Door objects
 *
 * express.e:28228 - Command priority: SYSCMD > BBSCMD > InternalCommand
 * BBSCMD doors are loaded from .info files in Commands/BBSCmd/
 */
export async function initializeDoors() {
  // Import commandCache to access loaded BBSCMD commands
  const { commandCache } = await import('./command-execution.handler');

  // Convert CommandDefinition objects from BBSCMD to Door objects
  const bbsCmdDoors: Door[] = [];

  for (const [cmdName, cmdDef] of commandCache.bbscmd) {
    // Map door type codes to execution types
    let doorType: string = cmdDef.type;
    if (doorType === 'TS') {
      doorType = 'typescript';
    } else if (doorType === 'PYTHON' || doorType === 'PY') {
      doorType = 'python';
    } else if (doorType === 'AREXX' || doorType === 'REXX') {
      doorType = 'arexx';
    }

    // Convert CommandDefinition to Door interface
    const door: Door = {
      id: cmdDef.name.toLowerCase(),
      name: cmdDef.name,
      description: `${cmdDef.type} door`,
      command: cmdDef.name.toUpperCase(),  // Door command (e.g., "HELLOTS")
      path: cmdDef.location,                // Path from LOCATION= field
      accessLevel: cmdDef.access || 0,      // ACCESS= level
      enabled: true,
      type: doorType,                       // TYPE= (XIM, AIM, TS  typescript, etc.)
      parameters: [],
      stack: cmdDef.stack,
      priority: cmdDef.priority,
      resident: cmdDef.resident,
      expertMode: cmdDef.expertMode,
      trapOn: cmdDef.trapOn,
      silent: cmdDef.silent,
      quickMode: cmdDef.quickMode,
      multiNode: cmdDef.multiNode,
      logInputs: cmdDef.logInputs,
      scriptCheck: cmdDef.scriptCheck,
      banner: cmdDef.banner,
      mimicVer: cmdDef.mimicVer,
      passParameters: cmdDef.passParameters,
      internal: cmdDef.internal,
      args: cmdDef.args,
      toolTypes: cmdDef.toolTypes
    };

    bbsCmdDoors.push(door);
    console.log(`[initializeDoors] Registered door: ${door.command}  ${door.path} (type: ${doorType})`);
  }

  // Hardcoded web doors (these don't have .info files)
  const webDoors: Door[] = [
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

  // Merge BBSCMD doors with hardcoded web doors
  doors = [...bbsCmdDoors, ...webDoors];

  console.log(`[initializeDoors] Total doors registered: ${doors.length}`);
}

/**
 * Execute external pager door (like runSysCommand('PAGER') in AmiExpress)
 */
export function executePagerDoor(socket: any, session: BBSSession, chatSession: ChatSession): boolean {
  // For now, always fall back to internal pager
  // In full implementation, this would check for PAGER door and execute it
  return false;
}

/**
 * Execute client door (browser-based)
 * Serves bundled JavaScript to browser and establishes WebSocket bridge
 */
async function executeClientDoor(socket: any, session: BBSSession, door: Door, manifest: any): Promise<void> {
  console.log(`[executeClientDoor] Starting client door: ${door.name}`);

  const { getClientDoorBridge } = require('../doors/client-door-bridge');
  const bridge = getClientDoorBridge();

  try {
    // Start WebSocket bridge session
    const sessionId = bridge.startSession(socket, session, door.id);

    // Set door active flag
    session.inDoorManager = true;
    console.log(`[executeClientDoor] Set inDoorManager=true for session`);

    // Set a no-op input handler to prevent BBS from echoing input
    // The actual input handling is done by the client-door-bridge
    session.doorInputHandler = (data: string) => {
      console.log(`[executeClientDoor] No-op doorInputHandler called with:`, JSON.stringify(data));
      // Input is handled by client-door-bridge, not here
    };
    console.log(`[executeClientDoor] Set doorInputHandler (no-op)`);

    // Notify frontend to load client door
    socket.emit('door:load-client', {
      doorId: door.id,
      sessionId,
      bundleUrl: `/api/doors/${door.id}/bundle.js?v=${Date.now()}`,
      manifest: {
        name: manifest.name,
        version: manifest.version,
        runtime: manifest.runtime,
      },
    });

    console.log(`[executeClientDoor] Client door session started: ${sessionId}`);

    // Log door execution
    const nodeId = session.nodeId || 0;
    const { user: clientDoorUser, isGuest } = resolveDoorExecutionUser(session);
    callersLog(isGuest ? null : clientDoorUser.id, clientDoorUser.username, 'Executed client door', door.name);
    callersLogManager.logDoor(nodeId, door.name);

  } catch (error) {
    console.error(`[executeClientDoor] Error starting client door:`, error);
    socket.emit('ansi-output', `\r\n\x1b[31mError starting door: ${(error as Error).message}\x1b[0m\r\n`);
    socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
    session.menuPause = false;
    session.subState = LoggedOnSubState.DISPLAY_MENU;
    delete session.inDoorManager;
  }
}

/**
 * Load door manifest for execution
 * Checks SDK examples and doors directory for package.json
 */
async function loadDoorManifestForExecution(door: Door): Promise<any | null> {
  try {
    // Extract door ID from path
    let doorId = door.id;

    console.log(`[loadDoorManifestForExecution] Loading manifest for door: ${door.name}, id: ${door.id}, path: ${door.path}`);

    // Try to get door ID from path
    if (door.path) {
      const pathParts = door.path.split('/');
      // Look for sdk/doors/<doorId> pattern
      const examplesIndex = pathParts.indexOf('examples');
      if (examplesIndex >= 0 && pathParts[examplesIndex + 1]) {
        doorId = pathParts[examplesIndex + 1];
      }
      // Look for doors/<doorId> pattern
      const doorsIndex = pathParts.indexOf('doors');
      if (doorsIndex >= 0 && pathParts[doorsIndex + 1]) {
        doorId = pathParts[doorsIndex + 1];
      }
    }

    console.log(`[loadDoorManifestForExecution] Extracted doorId: ${doorId}`);

    // Get BBS root (use BBS_ROOT env var or default to project root)
    const bbsRoot = process.env.BBS_ROOT || path.resolve(process.cwd(), '../..');

    // Prefer installed doors directory at BBS root
    const doorsPath = path.join(bbsRoot, 'doors', doorId, 'package.json');
    console.log(`[loadDoorManifestForExecution] Trying doors path: ${doorsPath}`);
    if (fs.existsSync(doorsPath)) {
      const content = fs.readFileSync(doorsPath, 'utf8');
      const manifest = JSON.parse(content);
      console.log(`[loadDoorManifestForExecution] Found doors manifest, runtime: ${manifest.runtime || 'not specified'}`);
      return manifest;
    }

    console.log(`[loadDoorManifestForExecution] No manifest found for ${doorId}`);
    return null;
  } catch (error) {
    console.error(`[loadDoorManifestForExecution] Error loading manifest:`, error);
    return null;
  }
}
