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

import {
  Screen,
  DockablePanel,
  List,
  Box,
  Text,
  ScrollableBox,
  Prompt,
  Question,
  Message,
  ConfirmModal
} from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import {
  createBox,
  createList,
  createText,
  DoorInputManager
} from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';

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
    bbs.write('\r\n\x1b[31mAccess Denied: SysOp only\x1b[0m\r\n');
    return Promise.resolve();
  }

  // Fetch installed doors
  const doors = await fetchInstalledDoors(bbs);

  if (doors.length === 0) {
    bbs.write('\r\n\x1b[36mNo doors are currently installed.\x1b[0m\r\n');
    return Promise.resolve();
  }

  // Create responsive screen
  const screen = new Screen({
    smartCSR: true,
    dockBorders: true,
    fullUnicode: true,
    title: 'Door Manager - SysOp',
    output: (data: string) => bbs.write(data),
    responsive: true,
  });

  // Create input manager (menu-based door, no game mode needed)
  const inputManager = new DoorInputManager(session, screen, {
    enableGameMode: false,  // Menu-based UI, not a game
    enableGrabKeys: false,  // Blessed widgets handle their own input
    enableMouse: true,      // Door has mouse support
  });

  // Enable input
  inputManager.enable();

  // Create header
  const header = createBox({
    parent: screen,
    top: 0,
    left: 0,
    width: '100%',
    height: 3,
    content: `{center}{bold}{cyan-fg}DOOR MANAGER{/cyan-fg}{/bold}{/center}\n{center}SysOp: ${username} | ${doors.length} doors installed{/center}`,
    style: {
      fg: 'white',
      bg: 'blue'
    },
    tags: true,
  });

  // Create dockable panel for door list
  // Layout: header(3) + doorPanel + infoPanel(7) + footer(3) = 100%
  const doorPanel = new DockablePanel({
    parent: screen,
    title: ' Installed Doors ',
    top: 3,
    left: 0,
    width: '100%',
    height: '100%-13',  // Total minus header(3), infoPanel(7), footer(3)
    dockPosition: 'float',
    showMinimizeButton: true,
    resizable: true,
    draggable: true,
    minWidth: 60,
    minHeight: 8,
    border: { type: 'line', fg: 'cyan' },
    style: { border: { fg: 'cyan' } },
  });

  // Create door list inside panel (top: 2 to account for panel title bar)
  const doorList = createList({
    parent: doorPanel,
    top: 2,
    left: 0,
    width: '100%-2',
    height: '100%-2',  // Fill panel minus borders only (top:2 already handles title bar)
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
    tags: true,
  });

  // Track last update time to avoid blocking rapid key repeats
  let lastInfoUpdate = 0;
  const INFO_UPDATE_INTERVAL = 100; // Update info panel at most every 100ms

  // Update info panel with rate limiting (not blocking)
  doorList.on('select item', () => {
    const now = Date.now();
    if (now - lastInfoUpdate > INFO_UPDATE_INTERVAL) {
      lastInfoUpdate = now;
      updateInfoPanel();
    }
    screen.render();
  });

  // Mouse wheel scrolling support
  doorList.on('wheeldown', () => {
    doorList.down(3);  // Scroll down 3 items
    screen.render();
  });

  doorList.on('wheelup', () => {
    doorList.up(3);  // Scroll up 3 items
    screen.render();
  });

  // Mouse click selection
  doorList.on('click', () => {
    updateInfoPanel();
    screen.render();
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

  // Create dockable info panel
  const infoPanel = new DockablePanel({
    parent: screen,
    title: ' Door Info ',
    bottom: 3,
    left: 0,
    width: '100%',
    height: 7,  // Fixed height to match layout calculation
    dockPosition: 'float',
    showMinimizeButton: true,
    resizable: true,
    draggable: true,
    minWidth: 40,
    minHeight: 5,
    border: { type: 'line', fg: 'green' },
    style: { border: { fg: 'green' } },
  });

  const infoText = createText({
    parent: infoPanel,
    top: 1,
    left: 1,
    right: 1,
    height: '100%-2',
    content: '',
    tags: true,
  });

  // Create footer
  const footer = createBox({
    parent: screen,
    bottom: 0,
    left: 0,
    width: '100%',
    height: 3,
    content: '{yellow-fg}Arrows:{/yellow-fg} Navigate  {yellow-fg}Enter:{/yellow-fg} Manage  {yellow-fg}I:{/yellow-fg} Info  {yellow-fg}E:{/yellow-fg} Enable/Disable  {yellow-fg}Q:{/yellow-fg} Quit',
    style: {
      fg: 'white'
    },
    tags: true,
  });

  // Update info panel when selection changes
  function updateInfoPanel() {
    const index = doorList.selected;
    if (index >= 0 && index < doors.length) {
      const door = doors[index];
      const content = `{bold}${door.name}{/bold}\n` +
                     `Description: ${door.description || 'No description'}\n` +
                     `Location: ${door.location || 'Unknown'}`;
      infoText.setContent(content);
      screen.render();
    }
  }

  // Register responsive constraints
  screen.responsiveLayout.registerElement(doorPanel, {
    minWidth: 60,
    minHeight: 10,
  });
  screen.responsiveLayout.registerElement(infoPanel, {
    minWidth: 40,
    minHeight: 5,
  });

  // Responsive breakpoint handling
  screen.responsiveLayout.onResize((width, height) => {
    const breakpoint = screen.responsiveLayout.getBreakpoint();

    if (breakpoint === 'small') {
      // Stack panels vertically on small screens - hide info panel
      infoPanel.hide();
      doorPanel.options.height = '100%-6';  // header(3) + footer(3)
    } else {
      // Show info panel on medium/large screens
      infoPanel.show();
      doorPanel.options.height = '100%-13';  // header(3) + infoPanel(7) + footer(3)
      infoPanel.options.height = 7;
    }

    screen.render();
  });

  // Initial info update
  updateInfoPanel();

  // Refresh function to reload door list after changes
  const refreshDoorList = async () => {
    try {
      const newDoors = await fetchInstalledDoors(bbs);
      doors.length = 0;
      doors.push(...newDoors);

      // Update list items
      const newItems = doors.map((door) => {
        const typeLabel = formatType(door.type).padEnd(4);
        const sizeLabel = formatSize(door.size).padStart(8);
        const accessLabel = `Lvl ${door.accessLevel}`.padStart(7);
        const statusLabel = door.enabled ? '{green-fg}ON{/green-fg}' : '{red-fg}OFF{/red-fg}';
        return `{yellow-fg}[${typeLabel}]{/yellow-fg} ${door.command.padEnd(12)} ${door.name.padEnd(25)} {cyan-fg}${sizeLabel}{/cyan-fg} ${accessLabel} ${statusLabel}`;
      });
      doorList.setItems(newItems);
      doorList.select(Math.min(doorList.selected, Math.max(0, doors.length - 1)));
      updateInfoPanel();

      // Restore focus to door list
      doorList.focus();
      screen.render();
    } catch (error) {
      // Log error but don't break the UI
      console.error('[door-manager] Error refreshing door list:', error);
      doorList.focus();
      screen.render();
    }
  };

  // Handle door selection (Enter key)
  doorList.on('select', (item: any, index: number) => {
    const selectedDoor = doors[index];

    // Show door management menu with refresh callback
    showDoorMenu(screen, selectedDoor, bbs, refreshDoorList);
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
    inputManager.disable();
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
          // Remove all event listeners to prevent memory leaks
          if (screen) {
            screen.removeAllListeners('destroy');
            screen.removeAllListeners('keypress');
          }
          if (doorList) {
            doorList.removeAllListeners('select item');
            doorList.removeAllListeners('select');
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
 * Show door management menu
 */
function showDoorMenu(screen: any, door: DoorInfo, bbs: any, onRefresh?: () => Promise<void>) {
  // Create overlay menu using SDK List widget
  const menuList = new List({
    parent: screen,
    top: 'center',
    left: 'center',
    width: 50,
    height: 12,
    border: { type: 'line' },
    style: {
      bg: 'black',
      border: { fg: 'cyan' },
      selected: {
        bg: 'blue',
        fg: 'white'
      },
      item: {
        fg: 'white'
      }
    },
    label: ` ${door.name} `,
    keys: true,
    vi: true,
    mouse: true,
    items: [
      'View Detailed Info',
      'Test Door',
      'Edit .info File',
      'Browse Archive (TODO)',
      '{red-fg}Delete Door{/red-fg}',
      'Cancel'
    ]
  });

  // Footer help text
  new Text({
    parent: menuList,
    bottom: 0,
    left: 1,
    right: 1,
    height: 1,
    content: '{yellow-fg}Enter:{/yellow-fg} Select  {yellow-fg}Esc:{/yellow-fg} Cancel',
    tags: true
  });

  menuList.focus();

  menuList.on('select', (item: any, index: number) => {
    menuList.destroy();
    screen.render();

    if (index === 0) {
      // View detailed info
      showDoorDetails(screen, door, bbs);
    } else if (index === 1) {
      // Test door
      if (bbs.executeCommand) {
        bbs.executeCommand(door.command);
      }
    } else if (index === 2) {
      // Edit .info file
      showInfoEditor(screen, door, bbs);
    } else if (index === 4) {
      // Delete door
      showDeleteConfirmation(screen, door, bbs, onRefresh);
    }
    // Other options are TODOs for now
  });

  menuList.key(['escape'], () => {
    menuList.destroy();
    screen.render();
  });

  screen.render();
}

/**
 * Show delete confirmation dialog
 */
function showDeleteConfirmation(screen: any, door: DoorInfo, bbs: any, onRefresh?: () => Promise<void>) {
  const modal = new ConfirmModal({
    parent: screen,
    title: ' Delete Door ',
    content: `{bold}Are you sure you want to delete:{/bold}\n\n` +
             `  {yellow-fg}${door.name}{/yellow-fg} (${door.command})\n\n` +
             `{red-fg}This will delete the door directory and .info files!{/red-fg}`,
    confirmText: 'Delete',
    cancelText: 'Cancel',
    confirmColor: 'red',
    cancelColor: 'green',
    style: {
      border: { fg: 'red' }
    },
    onConfirm: async () => {
      // Show deleting message
      const statusMsg = new Message({
        parent: screen,
        top: 'center',
        left: 'center',
        width: 40,
        height: 5,
        border: { type: 'line' },
        style: {
          bg: 'black',
          border: { fg: 'yellow' }
        },
        label: ' Status ',
        content: '\n  {yellow-fg}Deleting door...{/yellow-fg}',
        tags: true
      });
      statusMsg.display('\n  {yellow-fg}Deleting door...{/yellow-fg}'); 
      screen.render();

      try {
        let result: { success: boolean; message: string } | undefined;

        // Try to use the BBS deleteDoor API
        if (bbs.deleteDoor) {
          const isTS = door.type === 'TS' || door.type === 'typescript' || door.type === 'SDK';
          let doorName: string;
          if (door.location && door.location.includes('/')) {
            doorName = door.location.split('/').pop() || door.command;
          } else if (door.location) {
            doorName = door.location;
          } else {
            doorName = door.command;
          }

          if (!isTS) {
            doorName = door.command;
          }

          result = await bbs.deleteDoor(doorName, isTS);
        } else {
          result = { success: false, message: 'Delete API not available' };
        }

        statusMsg.destroy();

        // Show result
        const resultMsg = new Message({
          parent: screen,
          top: 'center',
          left: 'center',
          width: 50,
          height: 8,
          border: { type: 'line' },
          style: {
            bg: 'black',
            border: { fg: result?.success ? 'green' : 'red' }
          },
          label: result?.success ? ' Success ' : ' Error ',
          tags: true
        });

        const msgText = result?.success
          ? `\n{green-fg}Door deleted successfully!{/green-fg}\n${result.message}`
          : `\n{red-fg}Delete failed:{/red-fg}\n${result?.message || 'Unknown error'}`;

        resultMsg.display(msgText, async () => {
           if (result?.success && onRefresh) {
             await onRefresh();
           } else {
             screen.render();
           }
           resultMsg.destroy();
        });
        
        // Auto-hide after 2 seconds
        setTimeout(() => {
            if (!resultMsg.hidden && !resultMsg.destroyed) {
                resultMsg.hide();
            }
        }, 2000);
        
        screen.render();

      } catch (error) {
        statusMsg.destroy();

        const errorMsg = new Message({
          parent: screen,
          top: 'center',
          left: 'center',
          width: 50,
          height: 6,
          border: { type: 'line' },
          style: {
            bg: 'black',
            border: { fg: 'red' }
          },
          label: ' Error ',
          tags: true
        });
        
        errorMsg.display(`\n{red-fg}Error:{/red-fg} ${(error as Error).message}`);
        
        setTimeout(() => {
            if (!errorMsg.hidden && !errorMsg.destroyed) {
                errorMsg.hide();
                errorMsg.destroy();
            }
        }, 3000);
        
        screen.render();
      }
    }
  });
  
  modal.display(); // Changed from show() to display() which sets up overlay/responsive
  screen.render();
}

/**
 * Interface for .info file entry (tooltypes)
 */
interface InfoEntry {
  key: string;
  value: string;
  commented: boolean;
}

/**
 * Interface for .info editor state
 */
interface InfoEditorState {
  entries: InfoEntry[];
  selectedIndex: number;
  editingIndex: number;
  editBuffer: string;
  editingKey: boolean;  // true = editing key, false = editing value
  hasChanges: boolean;
  filePath: string;
  fileName: string;
  scrollOffset: number;
}

/**
 * Show the .info file editor
 * Uses bbs.readInfoFile() and bbs.writeInfoFile() for proper binary .info parsing
 */
function showInfoEditor(screen: any, door: DoorInfo, bbs: any) {
  // Create main editor box
  const editorBox = createBox({
    parent: screen,
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    style: {
      bg: 'black'
    }
  });

  // Header
  const header = createBox({
    parent: editorBox,
    top: 0,
    left: 0,
    width: '100%',
    height: 3,
    content: `{center}{bold}{cyan-fg}.INFO FILE EDITOR{/cyan-fg}{/bold}{/center}\n{center}Door: ${door.name} (${door.command}){/center}`,
    style: {
      fg: 'white',
      bg: 'blue'
    },
    tags: true
  });

  // File selector (door's .info vs Commands .info)
  const fileList = createList({
    parent: editorBox,
    top: 3,
    left: 0,
    width: '30%',
    height: '40%',
    label: ' Select File ',
    border: { type: 'line' },
    style: {
      border: { fg: 'cyan' },
      selected: { bg: 'blue', fg: 'white' },
      item: { fg: 'white' }
    },
    keys: true,
    vi: true,
    mouse: true,
    tags: true
  });

  // Editor panel
  const editorPanel = createBox({
    parent: editorBox,
    top: 3,
    left: '30%',
    width: '70%',
    height: '100%-6',
    label: ' Editor ',
    border: { type: 'line' },
    style: {
      border: { fg: 'green' }
    },
    tags: true
  });

  // Entry list inside editor panel
  const entryList = createList({
    parent: editorPanel,
    top: 0,
    left: 0,
    width: '100%-2',
    height: '100%-4',
    style: {
      selected: { bg: 'blue', fg: 'white', bold: true },
      item: { fg: 'white' }
    },
    keys: true,
    vi: true,
    mouse: true,
    tags: true
  });

  // Status line
  const statusLine = createText({
    parent: editorPanel,
    bottom: 1,
    left: 1,
    width: '100%-4',
    height: 1,
    content: '',
    tags: true
  });

  // Footer
  const footer = createBox({
    parent: editorBox,
    bottom: 0,
    left: 0,
    width: '100%',
    height: 3,
    content: '{yellow-fg}Tab:{/yellow-fg} Switch  {yellow-fg}Enter:{/yellow-fg} Edit Value  {yellow-fg}K:{/yellow-fg} Edit Key  {yellow-fg}A:{/yellow-fg} Add  {yellow-fg}D:{/yellow-fg} Delete  {yellow-fg}S:{/yellow-fg} Save  {yellow-fg}Q:{/yellow-fg} Quit',
    style: { fg: 'white' },
    tags: true
  });

  // State
  let state: InfoEditorState = {
    entries: [],
    selectedIndex: 0,
    editingIndex: -1,
    editBuffer: '',
    editingKey: false,
    hasChanges: false,
    filePath: '',
    fileName: '',
    scrollOffset: 0
  };

  let activePanel: 'files' | 'editor' = 'files';
  let availableFiles: { name: string; path: string; type: string }[] = [];

  // Find available .info files
  const findInfoFiles = async () => {
    availableFiles = [];

    // Get door name from location (e.g., "Doors/arkanoid" -> "arkanoid")
    const doorName = door.location ? door.location.split('/').pop() : null;

    // Check for door's own .info file
    if (doorName && bbs.fileExists) {
      const doorInfoPath = `Doors/${doorName}/${doorName}.info`;
      if (await bbs.fileExists(doorInfoPath)) {
        availableFiles.push({
          name: `${doorName}.info (Door)`,
          path: doorInfoPath,
          type: 'door'
        });
      }
    }

    // Check for Commands/BBSCmd .info file
    if (door.command && bbs.fileExists) {
      const cmdInfoPath = `Commands/BBSCmd/${door.command.toUpperCase()}.info`;
      if (await bbs.fileExists(cmdInfoPath)) {
        availableFiles.push({
          name: `${door.command.toUpperCase()}.info (Command)`,
          path: cmdInfoPath,
          type: 'command'
        });
      }
    }

    // Update file list
    if (availableFiles.length === 0) {
      fileList.setItems(['{gray-fg}No .info files found{/gray-fg}']);
    } else {
      fileList.setItems(availableFiles.map(f => f.name));
    }

    screen.render();
  };

  // Load a file into the editor
  const loadFile = async (index: number) => {
    if (index < 0 || index >= availableFiles.length) return;

    const file = availableFiles[index];
    // Use readInfoFile for proper binary .info file parsing
    if (bbs.readInfoFile) {
      try {
        const tooltypes = await bbs.readInfoFile(file.path);
        if (tooltypes) {
          state.entries = tooltypes.map((tt: InfoEntry) => ({
            key: tt.key,
            value: tt.value,
            commented: tt.commented
          }));
        } else {
          state.entries = [];
        }
        state.filePath = file.path;
        state.fileName = file.name;
        state.selectedIndex = 0;
        state.hasChanges = false;
        state.scrollOffset = 0;
        updateEntryList();
        updateStatus('');
      } catch (error) {
        updateStatus(`{red-fg}Error loading file: ${(error as Error).message}{/red-fg}`);
      }
    } else {
      updateStatus('{red-fg}readInfoFile not available{/red-fg}');
    }
  };

  // Update the entry list display
  const updateEntryList = () => {
    if (state.entries.length === 0) {
      entryList.setItems(['{gray-fg}(No entries){/gray-fg}']);
    } else {
      const items = state.entries.map((entry, i) => {
        // Show commented entries in gray with ! prefix
        const prefix = entry.commented ? '{gray-fg}!{/gray-fg}' : ' ';
        const keyColor = entry.commented ? 'gray' : 'cyan';
        const valueColor = entry.commented ? 'gray' : 'white';
        const keyPart = `{${keyColor}-fg}${entry.key.padEnd(15)}{/${keyColor}-fg}`;
        const valuePart = entry.value.length > 35
          ? entry.value.substring(0, 32) + '...'
          : entry.value;
        return `${prefix}${keyPart} = {${valueColor}-fg}${valuePart}{/${valueColor}-fg}`;
      });
      entryList.setItems(items);
    }
    screen.render();
  };

  // Update status line
  const updateStatus = (message: string) => {
    let status = message;
    if (!status && state.hasChanges) {
      status = '{yellow-fg}* Unsaved changes{/yellow-fg}';
    }
    if (!status && state.filePath) {
      status = `Editing: ${state.fileName}`;
    }
    statusLine.setContent(status);
    screen.render();
  };

  // Save file
  const saveFile = async () => {
    if (!state.filePath || !bbs.writeInfoFile) {
      updateStatus('{red-fg}Cannot save: no file loaded or writeInfoFile unavailable{/red-fg}');
      return;
    }

    try {
      // Use writeInfoFile for proper binary .info file writing
      const success = await bbs.writeInfoFile(state.filePath, state.entries);
      if (success) {
        state.hasChanges = false;
        updateStatus('{green-fg}File saved successfully!{/green-fg}');
        setTimeout(() => updateStatus(''), 2000);
      } else {
        updateStatus('{red-fg}Error saving file{/red-fg}');
      }
    } catch (error) {
      updateStatus(`{red-fg}Error saving: ${(error as Error).message}{/red-fg}`);
    }
  };

  // Start editing an entry
  const startEdit = (editKey: boolean) => {
    if (state.entries.length === 0) return;

    const entry = state.entries[state.selectedIndex];
    state.editingIndex = state.selectedIndex;
    state.editingKey = editKey;
    state.editBuffer = editKey ? entry.key : entry.value;

    // Show edit input
    showEditInput(editKey ? 'Key' : 'Value', state.editBuffer);
  };

  // Show edit input dialog
  const showEditInput = (label: string, initialValue: string) => {
    const prompt = new Prompt({
      parent: screen,
      top: 'center',
      left: 'center',
      width: 60,
      height: 10,
      border: { type: 'line' },
      style: {
        bg: 'black',
        border: { fg: 'yellow' }
      },
      label: ` Edit ${label} `,
      tags: true
    });

    prompt.showInput(`${label}:`, initialValue, (err: Error | null, value?: string) => {
      if (!err && value !== undefined && value !== null) {
        // Save edit
        if (state.editingIndex >= 0 && state.editingIndex < state.entries.length) {
          const entry = state.entries[state.editingIndex];
          if (state.editingKey) {
            entry.key = value;
          } else {
            entry.value = value;
          }
          state.hasChanges = true;
        }
        state.editingIndex = -1;
        state.editBuffer = '';
        prompt.destroy();
        updateEntryList();
        updateStatus('');
      } else {
        // Cancel
        state.editingIndex = -1;
        state.editBuffer = '';
        prompt.destroy();
        screen.render();
      }
    });
  };

  // Add new entry
  const addEntry = () => {
    const newKey = 'NEW_KEY';
    const newValue = 'value';
    state.entries.push({ key: newKey, value: newValue, commented: false });
    state.selectedIndex = state.entries.length - 1;
    state.hasChanges = true;
    updateEntryList();
    entryList.select(state.selectedIndex);
    updateStatus('');

    // Start editing the new key
    startEdit(true);
  };

  // Delete entry
  const deleteEntry = () => {
    if (state.entries.length === 0) return;

    state.entries.splice(state.selectedIndex, 1);
    if (state.selectedIndex >= state.entries.length) {
      state.selectedIndex = Math.max(0, state.entries.length - 1);
    }
    state.hasChanges = true;
    updateEntryList();
    if (state.entries.length > 0) {
      entryList.select(state.selectedIndex);
    }
    updateStatus('');
  };

  // Switch active panel
  const switchPanel = () => {
    if (activePanel === 'files') {
      activePanel = 'editor';
      entryList.focus();
      (fileList as any).style.border.fg = 'gray';
      (editorPanel as any).style.border.fg = 'green';
    } else {
      activePanel = 'files';
      fileList.focus();
      (fileList as any).style.border.fg = 'cyan';
      (editorPanel as any).style.border.fg = 'gray';
    }
    screen.render();
  };

  // Key handlers
  screen.key(['tab'], () => {
    switchPanel();
  });

  screen.key(['q', 'Q'], () => {
    if (state.hasChanges) {
      // Show unsaved changes warning
      const warnBox = createBox({
        parent: screen,
        top: 'center',
        left: 'center',
        width: 50,
        height: 6,
        border: { type: 'line' },
        style: { bg: 'black', border: { fg: 'yellow' } },
        content: '\n  {yellow-fg}You have unsaved changes!{/yellow-fg}\n\n  {yellow-fg}[Y]{/yellow-fg} Discard  {green-fg}[N]{/green-fg} Cancel',
        tags: true
      });
      screen.render();

      screen.once('keypress', (ch: string, key: any) => {
        warnBox.destroy();
        if (ch === 'y' || ch === 'Y') {
          editorBox.destroy();
          screen.render();
        } else {
          screen.render();
        }
      });
    } else {
      editorBox.destroy();
      screen.render();
    }
  });

  screen.key(['s', 'S'], () => {
    if (activePanel === 'editor') {
      saveFile();
    }
  });

  screen.key(['a', 'A'], () => {
    if (activePanel === 'editor' && state.filePath) {
      addEntry();
    }
  });

  screen.key(['d', 'D'], () => {
    if (activePanel === 'editor' && state.entries.length > 0) {
      deleteEntry();
    }
  });

  // File list selection
  fileList.on('select', (item: any, index: number) => {
    loadFile(index);
    switchPanel();
  });

  // Entry list selection (edit value)
  entryList.on('select', (item: any, index: number) => {
    state.selectedIndex = index;
    startEdit(false);  // Edit value by default
  });

  // Track selection changes
  entryList.on('select item', (item: any, index: number) => {
    state.selectedIndex = index;
  });

  // Key to edit key name
  screen.key(['k', 'K'], () => {
    if (activePanel === 'editor' && state.entries.length > 0) {
      startEdit(true);  // Edit key
    }
  });

  // Initialize
  fileList.focus();
  findInfoFiles();

  screen.render();
}

/**
 * Show detailed door information overlay
 */
function showDoorDetails(screen: any, door: DoorInfo, bbs: any) {
  // Container box
  const container = new Box({
    parent: screen,
    top: 'center',
    left: 'center',
    width: '80%',
    height: '80%',
    border: { type: 'line' },
    style: {
      bg: 'black',
      border: { fg: 'cyan' }
    },
    label: ` ${door.name} - Details `
  });

  // Scrollable details content
  const detailsBox = new ScrollableBox({
    parent: container,
    top: 0,
    left: 0,
    width: '100%-2',
    height: '100%-3', // Leave room for footer
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
    mouse: true,
    tags: true,
    style: {
      bg: 'black',
      fg: 'white'
    }
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
  
  // Footer
  new Text({
    parent: container,
    bottom: 0,
    left: 0,
    width: '100%',
    height: 1,
    content: '{yellow-fg}Arrows/PgUp/PgDn:{/yellow-fg} Scroll  {yellow-fg}Q/Esc:{/yellow-fg} Close',
    tags: true
  });

  detailsBox.focus();

  detailsBox.key(['q', 'Q', 'escape'], () => {
    container.destroy();
    screen.render();
  });

  screen.render();
}
