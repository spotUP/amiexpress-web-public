/**
 * Door Manager - SysOp Door Management Tool
 *
 * Manage installed BBS doors with neo-blessed UI.
 * Features:
 * - View installed doors with details (type, size, access level)
 * - Browse door archives (LZX, LHA, ZIP, etc.)
 * - Edit door .info files
 * - Upload new doors
 */

import blessed from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { createBox, createList, createText } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';

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
  location: string;
  enabled: boolean;
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

/**
 * Fetch all installed doors from BBS API
 */
async function fetchInstalledDoors(bbs: any): Promise<DoorInfo[]> {
  if (bbs.getDoorList) {
    const allDoors = await bbs.getDoorList();
    return allDoors.map((door: any) => ({
      id: door.id || door.command,
      command: door.command || door.id,
      name: door.name || door.id,
      description: door.description || '',
      type: door.type || door.doorType || 'AMI',
      size: door.size || 0,
      accessLevel: door.accessLevel || 0,
      location: door.location || '',
      enabled: door.enabled !== false
    }));
  }

  // Fallback: return empty array
  return [];
}

/**
 * Main application entry point
 */
export async function createApp(session: DoorSession) {
  const { bbs, user } = session;
  const username = user?.username || 'Guest';
  const isSysop = user?.secLevel >= 250;

  // Only sysops can use door manager
  if (!isSysop) {
    bbs.write('\r\n\x1b[31mAccess Denied: SysOp access required.\x1b[0m\r\n');
    bbs.write('\r\n\x1b[32mPress any key to continue...\x1b[0m');
    return new Promise<void>((resolve) => {
      const handler = () => {
        session.bbsSession.doorInputHandler = null;
        resolve();
      };
      session.bbsSession.doorInputHandler = handler;
    });
  }

  // Fetch installed doors
  const doors = await fetchInstalledDoors(bbs);

  if (doors.length === 0) {
    bbs.write('\r\n\x1b[36mNo doors are currently installed.\x1b[0m\r\n');
    bbs.write('\r\n\x1b[32mPress any key to continue...\x1b[0m');
    return new Promise<void>((resolve) => {
      const handler = () => {
        session.bbsSession.doorInputHandler = null;
        resolve();
      };
      session.bbsSession.doorInputHandler = handler;
    });
  }

  // Create screen
  const screen = blessed.screen({
    smartCSR: true,
    dockBorders: true,
    fullUnicode: true,
    title: 'Door Manager - SysOp',
    output: (data: string) => bbs.write(data),
  });

  // Connect input
  if (session.bbsSession) {
    session.bbsSession.doorInputHandler = (data: string) => {
      screen._handleData(data);
    };
  }

  // Create main container
  const container = createBox({
    parent: screen,
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
  });

  // Create header
  const header = createBox({
    parent: container,
    top: 0,
    left: 0,
    width: '100%',
    height: 3,
    content: `{center}{bold}{cyan-fg}DOOR MANAGER{/cyan-fg}{/bold}{/center}\n{center}SysOp: ${username} | ${doors.length} doors installed{/center}`,
    style: {
      fg: 'white',
      bg: 'blue'
    }
  });

  // Create door list
  const doorList = createList({
    parent: container,
    top: 3,
    left: 0,
    width: '100%',
    height: '100%-6',
    keys: true,
    vi: true,
    mouse: true,
    scrollable: true,
    alwaysScroll: true,
    scrollbar: {
      ch: ' ',
      style: {
        bg: 'blue'
      }
    },
    style: {
      selected: {
        bg: 'blue',
        fg: 'white',
        bold: true
      },
      item: {
        fg: 'white'
      }
    },
    label: ' Installed Doors '
  });

  // Populate door list
  const doorItems = doors.map((door, index) => {
    const typeLabel = formatType(door.type).padEnd(4);
    const sizeLabel = formatSize(door.size).padStart(8);
    const accessLabel = `Lvl ${door.accessLevel}`.padStart(7);
    const statusLabel = door.enabled ? '{green-fg}ON{/green-fg}' : '{red-fg}OFF{/red-fg}';

    return `{yellow-fg}[${typeLabel}]{/yellow-fg} ${door.command.padEnd(12)} ${door.name.padEnd(25)} {cyan-fg}${sizeLabel}{/cyan-fg} ${accessLabel} ${statusLabel}`;
  });

  doorList.setItems(doorItems);
  doorList.focus();

  // Create info panel
  const infoPanel = createBox({
    parent: container,
    bottom: 3,
    left: 0,
    width: '100%',
    height: 3,
    content: '',
    style: {
      fg: 'white',
      border: {
        fg: 'cyan'
      }
    },
    border: {
      type: 'line'
    },
    label: ' Door Info '
  });

  // Create footer
  const footer = createBox({
    parent: container,
    bottom: 0,
    left: 0,
    width: '100%',
    height: 3,
    content: '{yellow-fg}Arrows:{/yellow-fg} Navigate  {yellow-fg}Enter:{/yellow-fg} Manage  {yellow-fg}I:{/yellow-fg} Info  {yellow-fg}E:{/yellow-fg} Enable/Disable  {yellow-fg}Q:{/yellow-fg} Quit',
    style: {
      fg: 'white'
    }
  });

  // Update info panel when selection changes
  function updateInfoPanel() {
    const index = doorList.selected;
    if (index >= 0 && index < doors.length) {
      const door = doors[index];
      const content = `{bold}${door.name}{/bold}\n` +
                     `Description: ${door.description || 'No description'}\n` +
                     `Location: ${door.location || 'Unknown'}`;
      infoPanel.setContent(content);
      screen.render();
    }
  }

  // Initial info update
  updateInfoPanel();

  // Handle list selection change
  doorList.on('select item', () => {
    updateInfoPanel();
  });

  // Handle door selection (Enter key)
  doorList.on('select', async (item: any, index: number) => {
    const selectedDoor = doors[index];

    // Show door management menu (to be implemented)
    showDoorMenu(screen, selectedDoor, bbs);
  });

  // Handle info toggle (I key)
  screen.key(['i', 'I'], () => {
    const index = doorList.selected;
    if (index >= 0 && index < doors.length) {
      const door = doors[index];
      showDoorDetails(screen, door, bbs);
    }
  });

  // Handle enable/disable toggle (E key)
  screen.key(['e', 'E'], async () => {
    const index = doorList.selected;
    if (index >= 0 && index < doors.length) {
      const door = doors[index];

      // Toggle enabled state
      door.enabled = !door.enabled;

      // Update via BBS API
      if (bbs.updateDoor) {
        await bbs.updateDoor(door.id, { enabled: door.enabled });
      }

      // Update list item
      const typeLabel = formatType(door.type).padEnd(4);
      const sizeLabel = formatSize(door.size).padStart(8);
      const accessLabel = `Lvl ${door.accessLevel}`.padStart(7);
      const statusLabel = door.enabled ? '{green-fg}ON{/green-fg}' : '{red-fg}OFF{/red-fg}';

      doorList.setItem(index, `{yellow-fg}[${typeLabel}]{/yellow-fg} ${door.command.padEnd(12)} ${door.name.padEnd(25)} {cyan-fg}${sizeLabel}{/cyan-fg} ${accessLabel} ${statusLabel}`);
      screen.render();
    }
  });

  // Handle quit
  screen.key(['q', 'Q', 'escape'], () => {
    screen.destroy();
  });

  // Handle screen destroy
  screen.on('destroy', () => {
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
        console.log('[Door Manager] Cleanup called');
        try {
          if (!screen.destroyed) {
            screen.destroy();
          }
        } catch (err) {
          console.error('[Door Manager] Error destroying screen:', err);
        }
        resolve();
      }
    };

    screen.on('destroy', cleanup);

    // Also cleanup if socket disconnects
    if (session.socket) {
      session.socket.once('disconnect', () => {
        console.log('[Door Manager] Socket disconnected, cleaning up');
        cleanup();
      });
    }
  });
}

/**
 * Show door management menu
 */
function showDoorMenu(screen: any, door: DoorInfo, bbs: any) {
  // Create overlay menu
  const menuBox = createBox({
    parent: screen,
    top: 'center',
    left: 'center',
    width: 50,
    height: 12,
    border: { type: 'line' },
    style: {
      bg: 'black',  // Opaque background for overlay
      border: { fg: 'cyan' }
    },
    label: ` ${door.name} `
  });

  const menuList = createList({
    parent: menuBox,
    top: 0,
    left: 0,
    width: '100%',
    height: '100%-3',
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

  menuList.setItems([
    'View Detailed Info',
    'Test Door',
    'Edit .info File (TODO)',
    'Browse Archive (TODO)',
    'Delete Door (TODO)',
    'Cancel'
  ]);

  menuList.focus();

  const footer = createText({
    parent: menuBox,
    bottom: 0,
    left: 1,
    right: 1,
    height: 1,
    content: '{yellow-fg}Enter:{/yellow-fg} Select  {yellow-fg}Esc:{/yellow-fg} Cancel'
  });

  menuList.on('select', (item: any, index: number) => {
    menuBox.destroy();
    screen.render();

    if (index === 0) {
      // View detailed info
      showDoorDetails(screen, door, bbs);
    } else if (index === 1) {
      // Test door
      if (bbs.executeCommand) {
        bbs.executeCommand(door.command);
      }
    }
    // Other options are TODOs for now
  });

  screen.key(['escape'], () => {
    menuBox.destroy();
    screen.render();
  });

  screen.render();
}

/**
 * Show detailed door information overlay
 */
function showDoorDetails(screen: any, door: DoorInfo, bbs: any) {
  const detailsBox = createBox({
    parent: screen,
    top: 'center',
    left: 'center',
    width: '80%',
    height: '80%',
    border: { type: 'line' },
    style: {
      bg: 'black',  // Opaque background for overlay
      border: { fg: 'cyan' }
    },
    label: ` ${door.name} - Details `,
    scrollable: true,
    alwaysScroll: true,
    scrollbar: {
      ch: ' ',
      style: {
        bg: 'blue'
      }
    },
    keys: true,
    vi: true,
    mouse: true
  });

  // Build details content
  let content = '';
  content += '{bold}{cyan-fg}GENERAL INFORMATION{/cyan-fg}{/bold}\n';
  content += '{cyan-fg}' + '─'.repeat(70) + '{/cyan-fg}\n';
  content += `Command:        {white-fg}${door.command}{/white-fg}\n`;
  content += `Name:           {white-fg}${door.name}{/white-fg}\n`;
  content += `Description:    {white-fg}${door.description || 'No description'}{/white-fg}\n`;
  content += `Type:           {yellow-fg}${door.type}{/yellow-fg}\n`;
  content += `Size:           {cyan-fg}${formatSize(door.size)}{/cyan-fg}\n`;
  content += `Access Level:   {white-fg}${door.accessLevel}{/white-fg}\n`;
  content += `Status:         ${door.enabled ? '{green-fg}Enabled{/green-fg}' : '{red-fg}Disabled{/red-fg}'}\n`;
  content += `Location:       {white-fg}${door.location || 'Unknown'}{/white-fg}\n`;
  content += '\n';

  content += '{bold}{cyan-fg}TECHNICAL DETAILS{/cyan-fg}{/bold}\n';
  content += '{cyan-fg}' + '─'.repeat(70) + '{/cyan-fg}\n';
  content += `Door ID:        {white-fg}${door.id}{/white-fg}\n`;
  content += '\n';

  content += '{bold}{cyan-fg}NOTES{/cyan-fg}{/bold}\n';
  content += '{cyan-fg}' + '─'.repeat(70) + '{/cyan-fg}\n';
  content += 'Full .info file editing and archive browsing features are planned\n';
  content += 'for future releases. Use the backend DoorManager.ts for advanced\n';
  content += 'door management features.\n';

  detailsBox.setContent(content);
  detailsBox.focus();

  const footer = createText({
    parent: detailsBox,
    bottom: 0,
    left: 1,
    right: 1,
    height: 1,
    content: '{yellow-fg}Arrows/PgUp/PgDn:{/yellow-fg} Scroll  {yellow-fg}Q/Esc:{/yellow-fg} Close'
  });

  screen.key(['q', 'Q', 'escape'], () => {
    detailsBox.destroy();
    screen.render();
  });

  screen.render();
}
