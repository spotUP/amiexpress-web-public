/**
 * Sysop Menu Handler
 * Central menu for all sysop and admin commands
 * Dynamically lists sysop-level doors as well
 */

import { Socket } from 'socket.io';
import { BBSSession } from '../index';
import { LoggedOnSubState } from '../constants/bbs-states';
import {
  handleNodeManagementCommand,
  handleConferenceMaintenanceCommand,
} from './message-commands.handler';
import {
  handleConferenceFlagsCommand,
} from './advanced-commands.handler';
import { WebhookCommandsHandler } from './webhook-commands.handler';

interface SysopMenuItem {
  key: string;
  name: string;
  description: string;
  handler: (socket: Socket, session: BBSSession, params: string) => Promise<void> | void;
  minSecurity: number;
}

/**
 * Display the sysop menu
 */
export async function displaySysopMenu(socket: Socket, session: BBSSession, params: string): Promise<void> {
  // Check if user has sysop access
  if ((session.user?.secLevel || 0) < 100) {
    socket.emit('ansi-output', '\r\n\x1b[0;31mAccess denied. Sysop privileges required.\x1b[0m\r\n\r\n');
    session.subState = LoggedOnSubState.DISPLAY_MENU;
    session.menuPause = false;
    return;
  }

  // Build list of sysop commands
  const sysopCommands: SysopMenuItem[] = [
    {
      key: 'NM',
      name: 'Node Management',
      description: 'Manage nodes - bring online/offline, disconnect users',
      handler: handleNodeManagementCommand,
      minSecurity: 100
    },
    {
      key: 'CM',
      name: 'Conference Maintenance',
      description: 'Conference maintenance utilities',
      handler: handleConferenceMaintenanceCommand,
      minSecurity: 100
    },
    {
      key: 'CF',
      name: 'Conference Flags',
      description: 'Manage conference flags (M/A/F/Z)',
      handler: handleConferenceFlagsCommand,
      minSecurity: 100
    },
    {
      key: 'WEBHOOK',
      name: 'Webhook Management',
      description: 'Manage webhooks for BBS integration',
      handler: async (socket, session, params) => {
        await WebhookCommandsHandler.handleWebhookCommand(socket, session);
      },
      minSecurity: 100
    },
    // Add more sysop commands here as they are implemented
  ];

  // Filter by user security level
  const availableCommands = sysopCommands.filter(cmd =>
    (session.user?.secLevel || 0) >= cmd.minSecurity
  );

  // Get sysop-level doors
  const sysopDoors = await getSysopDoors(session);

  // Check if called with a specific command
  if (params) {
    const command = params.trim().toUpperCase();

    // Check sysop commands
    const sysopCmd = availableCommands.find(cmd => cmd.key === command);
    if (sysopCmd) {
      await sysopCmd.handler(socket, session, '');
      return;
    }

    // Check sysop doors
    const door = sysopDoors.find(d => d.command.toUpperCase() === command);
    if (door) {
      // Launch the door
      socket.emit('ansi-output', `\r\n\x1b[0;33mLaunching ${door.name}...\x1b[0m\r\n`);
      // The door will be launched by the command handler
      return;
    }

    socket.emit('ansi-output', `\r\n\x1b[0;31mUnknown sysop command: ${command}\x1b[0m\r\n\r\n`);
  }

  // Display the menu
  showSysopMenu(socket, availableCommands, sysopDoors);

  // Set up menu state
  session.subState = LoggedOnSubState.READ_COMMAND;
  session.inSysopMenu = true;
}

/**
 * Show the sysop menu UI
 */
function showSysopMenu(socket: Socket, commands: SysopMenuItem[], doors: any[]): void {
  socket.emit('ansi-output', '\x1b[2J\x1b[H'); // Clear screen

  // Header
  socket.emit('ansi-output', '\x1b[0;36m');
  socket.emit('ansi-output', '===============================================================================\r\n');
  socket.emit('ansi-output', '\x1b[0;37m                          SYSOP COMMANDS MENU\x1b[0;36m\r\n');
  socket.emit('ansi-output', '===============================================================================\r\n');
  socket.emit('ansi-output', '\x1b[0m\r\n');

  // Display built-in sysop commands
  socket.emit('ansi-output', '\x1b[0;35m- -- --- Built-In Sysop Commands ----------------------------------------\r\n');
  socket.emit('ansi-output', '\x1b[0m');

  for (const cmd of commands) {
    const keyPart = `[\x1b[0;37m${cmd.key}\x1b[0;31m]`;
    const paddedKey = keyPart + ' '.repeat(Math.max(0, 20 - cmd.key.length - 2));
    socket.emit('ansi-output', `  \x1b[0;31m${paddedKey}\x1b[0;34m... \x1b[0;32m${cmd.description}\r\n`);
  }

  // Display sysop-level doors if any
  if (doors.length > 0) {
    socket.emit('ansi-output', '\x1b[0m\r\n');
    socket.emit('ansi-output', '\x1b[0;35m- -- --- Sysop-Level Doors ----------------------------------------------\r\n');
    socket.emit('ansi-output', '\x1b[0m');

    for (const door of doors) {
      const keyPart = `[\x1b[0;37m${door.command}\x1b[0;31m]`;
      const paddedKey = keyPart + ' '.repeat(Math.max(0, 20 - door.command.length - 2));
      socket.emit('ansi-output', `  \x1b[0;31m${paddedKey}\x1b[0;34m... \x1b[0;32m${door.description}\r\n`);
    }
  }

  // Footer
  socket.emit('ansi-output', '\x1b[0m\r\n');
  socket.emit('ansi-output', '\x1b[0;35m- -- --- -----------------------------------------------------------------\r\n');
  socket.emit('ansi-output', '\x1b[0m');
  socket.emit('ansi-output', '  \x1b[0;31m[\x1b[0;37mQ\x1b[0;31m]\x1b[0;34m... \x1b[0;32mQuit to main menu\r\n');
  socket.emit('ansi-output', '\x1b[0;35m- -- --- -----------------------------------------------------------------\r\n');
  socket.emit('ansi-output', '\x1b[0m\r\n');
  socket.emit('ansi-output', '\x1b[0;32mSelect command: \x1b[0;37m');
}

/**
 * Get list of doors with sysop-level access
 */
async function getSysopDoors(session: BBSSession): Promise<any[]> {
  const sysopDoors: any[] = [];

  try {
    // Scan for Amiga doors with sysop access
    const { getAmigaDoorManager } = require('../doors/amigaDoorManager');
    const amigaDoorMgr = getAmigaDoorManager();
    const amigaDoors = await amigaDoorMgr.scanInstalledDoors();

    // Filter for sysop-level doors (access level >= 100)
    const sysopAmigaDoors = amigaDoors.filter((door: any) =>
      door.installed &&
      (door.access || 0) >= 100 &&
      (session.user?.secLevel || 0) >= (door.access || 0)
    );

    sysopDoors.push(...sysopAmigaDoors.map((door: any) => ({
      name: door.name,
      command: door.command,
      description: door.description || door.name,
      type: 'amiga'
    })));

    // TODO: Add TypeScript doors with sysop access
    // For now, we'll just use Amiga doors

  } catch (error) {
    console.error('[Sysop Menu] Error scanning for sysop doors:', error);
  }

  return sysopDoors;
}

/**
 * Handle input while in sysop menu
 */
export async function handleSysopMenuInput(socket: Socket, session: BBSSession, input: string): Promise<void> {
  const command = input.trim().toUpperCase();

  // Check for quit
  if (command === 'Q' || command === '') {
    socket.emit('ansi-output', '\r\n\x1b[0;32mReturning to main menu...\x1b[0m\r\n\r\n');
    session.inSysopMenu = false;
    session.subState = LoggedOnSubState.DISPLAY_MENU;
    session.menuPause = false;
    return;
  }

  // Execute the selected command
  await displaySysopMenu(socket, session, command);

  // Return to menu unless the command changed the state
  if (session.inSysopMenu) {
    await displaySysopMenu(socket, session, '');
  }
}
