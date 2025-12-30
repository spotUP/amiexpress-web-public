/**
 * Doors Menu - Interactive Door Selection with Categories
 *
 * Displays available doors organized by category with arrow key navigation.
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
  category?: string;
}

interface CategoryNode {
  name: string;
  fullPath: string;
  children: Map<string, CategoryNode>;
  doors: DoorInfo[];
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
 * Build category tree from door list
 */
function buildCategoryTree(doors: DoorInfo[]): CategoryNode {
  const root: CategoryNode = {
    name: 'All Doors',
    fullPath: '',
    children: new Map(),
    doors: []
  };

  for (const door of doors) {
    const category = door.category || 'Misc';
    const parts = category.split('/');

    let current = root;
    let pathSoFar = '';

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      pathSoFar = pathSoFar ? `${pathSoFar}/${part}` : part;

      if (!current.children.has(part)) {
        current.children.set(part, {
          name: part,
          fullPath: pathSoFar,
          children: new Map(),
          doors: []
        });
      }
      current = current.children.get(part)!;
    }

    // Add door to its final category
    current.doors.push(door);
  }

  return root;
}

/**
 * Get category at path
 */
function getCategoryAtPath(root: CategoryNode, path: string[]): CategoryNode | null {
  let current = root;
  for (const part of path) {
    const child = current.children.get(part);
    if (!child) return null;
    current = child;
  }
  return current;
}

/**
 * Count total doors in a category (including subcategories)
 */
function countDoorsInCategory(node: CategoryNode): number {
  let count = node.doors.length;
  for (const child of node.children.values()) {
    count += countDoorsInCategory(child);
  }
  return count;
}

/**
 * Get all doors in a category (including subcategories)
 */
function getAllDoorsInCategory(node: CategoryNode): DoorInfo[] {
  const doors: DoorInfo[] = [...node.doors];
  for (const child of node.children.values()) {
    doors.push(...getAllDoorsInCategory(child));
  }
  return doors;
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

  // Build category tree
  const categoryTree = buildCategoryTree(doors);

  // Navigation state
  let currentPath: string[] = [];
  let viewMode: 'categories' | 'doors' = 'categories';
  let currentCategory = categoryTree;

  // Create screen
  let screen: ReturnType<typeof blessed.screen>;
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

  // Create breadcrumb bar
  const breadcrumb = createBox({
    parent: screen,
    top: 1,
    left: 0,
    width: '100%',
    height: 1,
    content: '{cyan-fg}Location:{/cyan-fg} All Doors',
    style: {
      fg: 'cyan',
      bg: 'black'
    }
  });

  // Create main list
  const mainList = createList({
    parent: screen,
    top: 2,
    left: 0,
    width: '100%',
    height: '100%-5',
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
        fg: 'white'
      },
      item: {
        fg: 'white'
      }
    },
    tags: true,
  });

  // Mouse wheel scrolling support
  mainList.on('wheeldown', () => {
    mainList.down(3);
    screen.render();
  });

  mainList.on('wheelup', () => {
    mainList.up(3);
    screen.render();
  });

  // Ensure smooth scrolling with held keys
  mainList.on('select item', () => {
    screen.render();
  });

  // Create footer
  const footer = createBox({
    parent: screen,
    bottom: 0,
    left: 0,
    width: '100%',
    height: 3,
    border: { type: 'line' },
    style: {
      fg: 'white',
      border: { fg: 'gray' }
    },
    content: '{yellow-fg}Up/Down:{/yellow-fg} Navigate  {yellow-fg}Enter:{/yellow-fg} Select  {yellow-fg}Backspace:{/yellow-fg} Back  {yellow-fg}Q:{/yellow-fg} Quit'
  });

  /**
   * Update breadcrumb display
   */
  function updateBreadcrumb() {
    const parts = ['{cyan-fg}Location:{/cyan-fg} All Doors'];
    for (const part of currentPath) {
      parts.push(` {gray-fg}/{/gray-fg} ${part}`);
    }
    if (viewMode === 'doors') {
      parts.push(' {yellow-fg}(viewing doors){/yellow-fg}');
    }
    breadcrumb.setContent(parts.join(''));
  }

  /**
   * Render category view
   */
  function renderCategoryView() {
    viewMode = 'categories';
    currentCategory = getCategoryAtPath(categoryTree, currentPath) || categoryTree;

    const items: string[] = [];

    // Add ".. Back" if not at root
    if (currentPath.length > 0) {
      items.push('{gray-fg}[..]{/gray-fg} Back to parent');
    }

    // Add subcategories
    const sortedCategories = Array.from(currentCategory.children.keys()).sort();
    for (const catName of sortedCategories) {
      const child = currentCategory.children.get(catName)!;
      const doorCount = countDoorsInCategory(child);
      const hasSubcats = child.children.size > 0;
      const icon = hasSubcats ? '{magenta-fg}[+]{/magenta-fg}' : '{green-fg}[>]{/green-fg}';
      items.push(`${icon} {white-fg}${catName.padEnd(25)}{/white-fg} {cyan-fg}(${doorCount} door${doorCount !== 1 ? 's' : ''}){/cyan-fg}`);
    }

    // Add "View All Doors" option if there are doors at this level or children
    const directDoors = currentCategory.doors.length;
    const totalDoors = countDoorsInCategory(currentCategory);
    if (totalDoors > 0) {
      items.push(`{yellow-fg}[*]{/yellow-fg} {white-fg}View All Doors{/white-fg} {cyan-fg}(${totalDoors} total){/cyan-fg}`);
    }

    // If no subcategories, just show doors directly
    if (sortedCategories.length === 0 && directDoors > 0) {
      renderDoorView();
      return;
    }

    mainList.setItems(items);
    mainList.select(0);
    updateBreadcrumb();
    screen.render();
  }

  /**
   * Render door list view
   */
  function renderDoorView() {
    viewMode = 'doors';
    currentCategory = getCategoryAtPath(categoryTree, currentPath) || categoryTree;

    const doorsToShow = getAllDoorsInCategory(currentCategory);
    const items: string[] = [];

    // Add back option
    items.push('{gray-fg}[..]{/gray-fg} Back to categories');

    // Add doors sorted by name
    const sortedDoors = doorsToShow.sort((a, b) => a.name.localeCompare(b.name));
    for (const door of sortedDoors) {
      const typeLabel = formatType(door.type);
      const sizeLabel = formatSize(door.size);
      items.push(`{yellow-fg}[${typeLabel.padEnd(3)}]{/yellow-fg} {green-fg}${door.command.padEnd(12)}{/green-fg} {white-fg}${door.name.padEnd(25)}{/white-fg} {cyan-fg}${sizeLabel.padStart(8)}{/cyan-fg}`);
    }

    mainList.setItems(items);
    mainList.select(0);
    updateBreadcrumb();
    screen.render();
  }

  /**
   * Handle selection in category view
   */
  function handleCategorySelect(index: number) {
    const hasBackOption = currentPath.length > 0;
    let adjustedIndex = hasBackOption ? index - 1 : index;

    // Check if "Back" was selected
    if (hasBackOption && index === 0) {
      goBack();
      return;
    }

    const sortedCategories = Array.from(currentCategory.children.keys()).sort();

    // Check if a category was selected
    if (adjustedIndex < sortedCategories.length) {
      const selectedCat = sortedCategories[adjustedIndex];
      currentPath.push(selectedCat);
      renderCategoryView();
      return;
    }

    // Check if "View All Doors" was selected
    const viewAllIndex = hasBackOption ? sortedCategories.length + 1 : sortedCategories.length;
    if (index === viewAllIndex) {
      renderDoorView();
      return;
    }
  }

  /**
   * Handle selection in door view
   */
  async function handleDoorSelect(index: number) {
    // Index 0 is "Back"
    if (index === 0) {
      goBack();
      return;
    }

    const doorsToShow = getAllDoorsInCategory(currentCategory).sort((a, b) => a.name.localeCompare(b.name));
    const selectedDoor = doorsToShow[index - 1];

    if (selectedDoor) {
      screen.destroy();
      if (bbs.executeCommand) {
        await bbs.executeCommand(selectedDoor.command);
      } else {
        bbs.write(`\r\nLaunching ${selectedDoor.name}...\r\n`);
      }
    }
  }

  /**
   * Go back one level
   */
  function goBack() {
    if (viewMode === 'doors') {
      // Check if current category has subcategories to show
      const cat = getCategoryAtPath(categoryTree, currentPath);
      if (cat && cat.children.size > 0) {
        // Has subcategories, show category view
        renderCategoryView();
      } else if (currentPath.length > 0) {
        // No subcategories at this level, go up one level
        currentPath.pop();
        renderCategoryView();
      } else {
        // At root with no categories, show category view (will show root level)
        renderCategoryView();
      }
    } else if (currentPath.length > 0) {
      currentPath.pop();
      renderCategoryView();
    }
  }

  // Handle selection
  mainList.on('select', async (item: any, index: number) => {
    if (viewMode === 'categories') {
      handleCategorySelect(index);
    } else {
      await handleDoorSelect(index);
    }
  });

  // Handle back navigation
  screen.key(['backspace', 'delete'], () => {
    goBack();
  });

  // Handle quit
  screen.key(['q', 'Q', 'escape'], () => {
    if (currentPath.length > 0 || viewMode === 'doors') {
      goBack();
    } else {
      screen.destroy();
    }
  });

  // Handle screen destroy
  screen.on('destroy', () => {
    if (session.bbsSession) {
      session.bbsSession.doorInputHandler = null;
    }
  });

  // Initial render
  mainList.focus();
  renderCategoryView();

  // Return promise that resolves when screen is destroyed
  return new Promise<void>((resolve) => {
    let resolved = false;

    const cleanup = () => {
      if (!resolved) {
        resolved = true;
        try {
          if (mainList) mainList.removeAllListeners('select');
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
      accessLevel: door.accessLevel || 0,
      category: door.category || undefined
    }));
    return filtered;
  }

  return [];
}
