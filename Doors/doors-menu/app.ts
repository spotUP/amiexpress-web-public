/**
 * Doors Menu - Interactive Door Selection
 *
 * Displays available doors with arrow key navigation.
 * Uses SDK blessed helpers (no duplicate code).
 */

import blessed from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { createBox, createList } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';

interface DoorSession {
  socket: any;
  user: any;
  bbsSession: any;
  bbs: any;
  params: string[];
}

interface DoorInfo {
  id: string;
  command: string;
  name: string;
  description: string;
  type: string;
  size: number;
  accessLevel: number;
}

/**
 * Format file size for display
 */
function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

/**
 * Format door type badge
 */
function formatType(type: string): string {
  const typeMap: Record<string, string> = {
    'TS': 'TS',
    'typescript': 'TS',
    'XIM': 'XIM',
    'xim': 'XIM',
    'AMI': 'AMI',
    'amiga': 'AMI',
    'ami': 'AMI',
    'PYTHON': 'PY',
    'python': 'PY',
    'PY': 'PY',
    'AREXX': 'RX',
    'arexx': 'RX',
    'RX': 'RX',
    'ARC': 'ARC',
    'archive': 'ARC',
    'WEB': 'WEB',
    'web': 'WEB'
  };
  return typeMap[type] || 'AMI';
}

export async function createApp(session: DoorSession) {
  const { bbs, user } = session;
  const username = user?.username || 'Guest';
  const userLevel = user?.secLevel || 0;

  // Fetch available doors from BBS API
  const doors = await fetchAvailableDoors(bbs, userLevel);

  if (doors.length === 0) {
    bbs.write('\r\n\x1b[36mNo doors are currently available.\x1b[0m\r\n');
    bbs.write('\r\n\x1b[32mPress any key to continue...\x1b[0m');
    return new Promise<void>((resolve) => {
      const handler = () => {
        session.bbsSession.doorInputHandler = null;
        resolve();
      };
      session.bbsSession.doorInputHandler = handler;
    });
  }

  // Check if a specific door was requested via params
  if (session.params && session.params.length > 0) {
    const doorName = session.params[0].toUpperCase();
    const matchedDoor = doors.find(d =>
      d.command.toUpperCase() === doorName ||
      d.id.toUpperCase() === doorName
    );

    if (matchedDoor) {
      // Execute the door via BBS command system
      await bbs.executeCommand(matchedDoor.command);
      return;
    } else {
      bbs.write(`\r\n\x1b[31mDoor "${doorName}" not found.\x1b[0m\r\n`);
      bbs.write('\r\n\x1b[32mPress any key to continue...\x1b[0m');
      return new Promise<void>((resolve) => {
        const handler = () => {
          session.bbsSession.doorInputHandler = null;
          resolve();
        };
        session.bbsSession.doorInputHandler = handler;
      });
    }
  }

  // Create screen
  let screen;
  try {
    screen = blessed.screen({
      smartCSR: true,
      dockBorders: true,
      fullUnicode: true,
      title: 'Door Games & Utilities',
      output: (data: string) => bbs.write(data),
    });
  } catch (error) {
    bbs.write('\r\n\x1b[31mError creating door interface\x1b[0m\r\n');
    throw error;
  }

  // Connect input
  if (session.bbsSession) {
    session.bbsSession.doorInputHandler = (data: string) => {
      screen._handleData(data);
      return true;
    };
  }

  // Create header
  const header = createBox({
    parent: screen,
    top: 0,
    left: 0,
    width: '100%',
    height: 1,
    content: ' DOOR GAMES & UTILITIES ',
    style: {
      fg: 'white',
      bg: 'blue'
    }
  });

  // Create door list
  const doorList = createList({
    parent: screen,
    top: 2,
    left: 0,
    width: '100%',
    height: '100%-4',
    keys: true,
    vi: true,
    mouse: true,
    style: {
      selected: {
        bg: 'blue',
        fg: 'white'
      },
      item: {
        fg: 'white'
      }
    }
  });

  // Populate door list
  const doorItems = doors.map(door => {
    const typeLabel = formatType(door.type);
    const sizeLabel = formatSize(door.size);
    return `{yellow-fg}[${typeLabel}]{/yellow-fg} ${door.command.padEnd(12)} ${door.name.padEnd(30)} {cyan-fg}${sizeLabel.padStart(8)}{/cyan-fg}`;
  });

  doorList.setItems(doorItems);
  doorList.focus();

  // Create footer
  const footer = createBox({
    parent: screen,
    bottom: 0,
    left: 0,
    width: '100%',
    height: 2,
    content: '{yellow-fg}Arrows:{/yellow-fg} Navigate  {yellow-fg}Enter:{/yellow-fg} Launch Door  {yellow-fg}Q:{/yellow-fg} Quit',
    style: {
      fg: 'white'
    }
  });

  // Handle door selection
  doorList.on('select', async (item: any, index: number) => {
    const selectedDoor = doors[index];

    // Destroy screen
    screen.destroy();

    // Execute the door via BBS command system
    if (bbs.executeCommand) {
      await bbs.executeCommand(selectedDoor.command);
    } else {
      // Fallback: just log and exit
      bbs.write(`\r\nLaunching ${selectedDoor.name}...\r\n`);
    }
  });

  // Handle quit
  screen.key(['q', 'Q', 'escape'], () => {
    screen.destroy();
  });

  // Handle screen destroy
  screen.on('destroy', () => {
    // Cleanup
    if (session.bbsSession) {
      session.bbsSession.doorInputHandler = null;
    }
  });

  // Initial render
  screen.render();

  // Return promise that resolves when screen is destroyed
  return new Promise<void>((resolve) => {
    let resolved = false;

    const cleanup = () => {
      if (!resolved) {
        resolved = true;
        try {
          // Remove event listeners
          if (doorList) {
            doorList.removeAllListeners('select');
          }
          if (screen) {
            screen.removeAllListeners('destroy');
            screen.removeAllListeners('keypress');
          }
          if (!screen.destroyed) {
            screen.destroy();
          }
        } catch (err) {
          // Silently handle cleanup errors
        }
        resolve();
      }
    };

    screen.on('destroy', cleanup);

    // Also cleanup if socket disconnects
    if (session.socket) {
      session.socket.once('disconnect', () => {
        cleanup();
      });
    }
  });
}

/**
 * Fetch available doors from BBS API
 */
async function fetchAvailableDoors(bbs: any, userLevel: number): Promise<DoorInfo[]> {
  // Use BBS API to get door list
  if (bbs.getDoorList) {
    const allDoors = await bbs.getDoorList();
    const filtered = allDoors.filter((door: any) =>
      door.enabled &&
      userLevel >= (door.accessLevel || 0)
    ).map((door: any) => ({
      id: door.id || door.command,
      command: door.command || door.id,
      name: door.name || door.id,
      description: door.description || '',
      type: door.type || door.doorType || 'AMI',
      size: door.size || 0,
      accessLevel: door.accessLevel || 0
    }));
    return filtered;
  }

  // Fallback: return empty array if BBS API not available
  return [];
}
