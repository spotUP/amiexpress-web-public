/**
 * ANSI Editor - Complete ANSI Art Editor Door
 *
 * Features:
 * - File browser with directory navigation
 * - Gallery view with ANSI previews
 * - Full ANSI editor (text + drawing modes)
 * - SAUCE metadata editor
 * - Settings/preferences
 * - Help system
 * - Export to multiple formats (.ANS, .ASC, .XB)
 */

import type { BBSSession } from '../../web/backend/src/types';
import { showANSIEditor } from '../../sdk/engines/ui/ansi-editor';
import blessed from '../../sdk/engines/ui/blessed';
import * as amigafs from '../../web/backend/src/utils/amigafs';
import * as path from 'path';

interface AnsiFile {
  filename: string;
  fullPath: string;
  size: number;
  modified: Date;
  width?: number;
  height?: number;
  title?: string;
  author?: string;
  group?: string;
}

interface EditorSettings {
  defaultDir: string;
  autoSave: boolean;
  backupOnSave: boolean;
  showLineNumbers: boolean;
  showToolbar: boolean;
  showStatusBar: boolean;
  confirmDelete: boolean;
}

interface EditorState {
  currentFile: AnsiFile | null;
  currentDir: string;
  files: AnsiFile[];
  settings: EditorSettings;
  mode: 'menu' | 'browser' | 'gallery' | 'editor' | 'settings' | 'help';
  selectedIndex: number;
  modified: boolean;
}

export default async function ansiEditorDoor(session: BBSSession): Promise<void> {
  const screen = blessed.screen({
    smartCSR: true,
    fullUnicode: true,
    dockBorders: true,
    autoPadding: true
  });

  // Initialize state
  const ansiDir = path.join(process.cwd(), 'data', 'ansi-art');
  if (!amigafs.existsSync(ansiDir)) {
    amigafs.mkdirSync(ansiDir, { recursive: true });
  }

  const state: EditorState = {
    currentFile: null,
    currentDir: ansiDir,
    files: [],
    settings: {
      defaultDir: ansiDir,
      autoSave: false,
      backupOnSave: true,
      showLineNumbers: true,
      showToolbar: true,
      showStatusBar: true,
      confirmDelete: true
    },
    mode: 'menu',
    selectedIndex: 0,
    modified: false
  };

  try {
    // Show main menu
    await showMainMenu(session, screen, state);
  } catch (error) {
    session.writeLine(`\r\n{red-fg}Error: ${error instanceof Error ? error.message : String(error)}{/red-fg}\r\n`);
  } finally {
    screen.destroy();
  }
}

async function showMainMenu(session: BBSSession, screen: any, state: EditorState): Promise<void> {
  let exit = false;

  while (!exit) {
    screen.children.forEach((child: any) => child.destroy());

    // Title box
    const title = blessed.box({
      parent: screen,
      top: 0,
      left: 0,
      width: '100%',
      height: 3,
      content: '{center}{cyan-fg}{bold}╔═══════════════════════════════════════════════════════════════════════════╗{/bold}{/cyan-fg}\n' +
               '{cyan-fg}{bold}║{/bold}{/cyan-fg}  {yellow-fg}{bold}AmiExpress ANSI Art Editor{/bold}{/yellow-fg} - Professional ANSI/ASCII Art Creation  {cyan-fg}{bold}║{/bold}{/cyan-fg}\n' +
               '{cyan-fg}{bold}╚═══════════════════════════════════════════════════════════════════════════╝{/bold}{/cyan-fg}{/center}',
      tags: true,
      style: {
        fg: 'cyan',
        bg: 'black'
      }
    });

    // Menu box
    const menu = blessed.box({
      parent: screen,
      top: 4,
      left: 'center',
      width: 60,
      height: 16,
      border: {
        type: 'line',
        fg: 'cyan'
      },
      style: {
        fg: 'white',
        bg: 'black',
        border: {
          fg: 'cyan'
        }
      },
      tags: true
    });

    const menuItems = [
      { key: 'N', label: 'New File', desc: 'Create a new ANSI art file' },
      { key: 'O', label: 'Open File', desc: 'Open an existing file' },
      { key: 'B', label: 'File Browser', desc: 'Browse and manage ANSI files' },
      { key: 'G', label: 'Gallery View', desc: 'Visual gallery of ANSI art' },
      { key: 'S', label: 'Settings', desc: 'Configure editor preferences' },
      { key: 'H', label: 'Help', desc: 'Keyboard shortcuts and features' },
      { key: 'Q', label: 'Quit', desc: 'Exit ANSI Editor' }
    ];

    let content = '\n{center}{white-fg}{bold}Main Menu{/bold}{/white-fg}{/center}\n\n';
    menuItems.forEach(item => {
      const highlight = state.selectedIndex === menuItems.indexOf(item);
      if (highlight) {
        content += `  {black-bg}{yellow-fg}► [{bold}${item.key}{/bold}] ${item.label.padEnd(20)} ${item.desc}{/yellow-fg}{/black-bg}\n`;
      } else {
        content += `    {cyan-fg}[{bold}${item.key}{/bold}]{/cyan-fg} {white-fg}${item.label.padEnd(20)}{/white-fg} {gray-fg}${item.desc}{/gray-fg}\n`;
      }
    });

    menu.setContent(content);

    // Status bar
    const statusBar = blessed.box({
      parent: screen,
      bottom: 0,
      left: 0,
      width: '100%',
      height: 3,
      content: '{center}{gray-fg}Use arrow keys to navigate, Enter to select, or press letter key{/gray-fg}\n' +
               `{center}{gray-fg}Current directory: {white-fg}${state.currentDir}{/white-fg}{/gray-fg}{/center}`,
      tags: true,
      style: {
        fg: 'gray',
        bg: 'black'
      }
    });

    screen.render();

    // Handle input
    const choice = await waitForMenuInput(screen, menuItems.length, state);

    switch (choice) {
      case 'N':
      case 0:
        await createNewFile(session, screen, state);
        break;
      case 'O':
      case 1:
        await openFileDialog(session, screen, state);
        break;
      case 'B':
      case 2:
        await showFileBrowser(session, screen, state);
        break;
      case 'G':
      case 3:
        await showGallery(session, screen, state);
        break;
      case 'S':
      case 4:
        await showSettings(session, screen, state);
        break;
      case 'H':
      case 5:
        await showHelp(session, screen, state);
        break;
      case 'Q':
      case 6:
        if (state.modified) {
          const confirm = await confirmDialog(screen, 'You have unsaved changes. Really quit?');
          if (confirm) exit = true;
        } else {
          exit = true;
        }
        break;
    }
  }
}

async function createNewFile(session: BBSSession, screen: any, state: EditorState): Promise<void> {
  // Ask for filename
  const filename = await promptDialog(screen, 'New File', 'Enter filename (without extension):', '');
  if (!filename) return;

  const fullPath = path.join(state.currentDir, `${filename}.ans`);

  // Check if file exists
  if (amigafs.existsSync(fullPath)) {
    await messageDialog(screen, 'Error', 'File already exists!');
    return;
  }

  // Create empty file and open editor
  const newFile: AnsiFile = {
    filename: `${filename}.ans`,
    fullPath,
    size: 0,
    modified: new Date()
  };

  state.currentFile = newFile;
  await openEditor(session, screen, state, '');
}

async function openFileDialog(session: BBSSession, screen: any, state: EditorState): Promise<void> {
  // Get list of files
  const files = scanDirectory(state.currentDir);
  if (files.length === 0) {
    await messageDialog(screen, 'No Files', 'No ANSI files found in current directory.');
    return;
  }

  // Show file list dialog
  const fileList = blessed.list({
    parent: screen,
    top: 'center',
    left: 'center',
    width: '70%',
    height: '70%',
    label: ' Select File to Open ',
    border: {
      type: 'line',
      fg: 'cyan'
    },
    style: {
      fg: 'white',
      bg: 'black',
      selected: {
        fg: 'black',
        bg: 'cyan'
      },
      border: {
        fg: 'cyan'
      }
    },
    keys: true,
    vi: true,
    mouse: true,
    tags: true,
    items: files.map(f => `${f.filename.padEnd(30)} ${formatFileSize(f.size).padStart(10)} ${formatDate(f.modified)}`)
  });

  screen.render();

  return new Promise((resolve) => {
    fileList.on('select', async (item: any, index: number) => {
      fileList.destroy();
      screen.render();

      const selectedFile = files[index];
      state.currentFile = selectedFile;

      // Load file content
      const content = amigafs.readFileSync(selectedFile.fullPath, 'utf8') as string;
      await openEditor(session, screen, state, content);
      resolve();
    });

    fileList.on('cancel', () => {
      fileList.destroy();
      screen.render();
      resolve();
    });

    fileList.focus();
  });
}

async function showFileBrowser(session: BBSSession, screen: any, state: EditorState): Promise<void> {
  let exit = false;

  while (!exit) {
    const files = scanDirectory(state.currentDir);
    state.files = files;

    screen.children.forEach((child: any) => child.destroy());

    // Title
    const title = blessed.box({
      parent: screen,
      top: 0,
      left: 0,
      width: '100%',
      height: 1,
      content: `{center}{cyan-fg}{bold}File Browser - ${state.currentDir}{/bold}{/cyan-fg}{/center}`,
      tags: true
    });

    // File list
    const fileList = blessed.listtable({
      parent: screen,
      top: 2,
      left: 0,
      width: '100%',
      height: '100%-6',
      border: {
        type: 'line',
        fg: 'cyan'
      },
      style: {
        fg: 'white',
        bg: 'black',
        header: {
          fg: 'yellow',
          bold: true
        },
        cell: {
          selected: {
            fg: 'black',
            bg: 'cyan'
          }
        },
        border: {
          fg: 'cyan'
        }
      },
      keys: true,
      vi: true,
      mouse: true,
      tags: true
    });

    const data = [
      ['Filename', 'Size', 'Modified', 'Dimensions']
    ];

    files.forEach(f => {
      data.push([
        f.filename,
        formatFileSize(f.size),
        formatDate(f.modified),
        f.width && f.height ? `${f.width}x${f.height}` : 'Unknown'
      ]);
    });

    fileList.setData(data);

    // Command bar
    const commands = blessed.box({
      parent: screen,
      bottom: 0,
      left: 0,
      width: '100%',
      height: 3,
      content: '{center}{cyan-fg}[E]{/cyan-fg}dit {cyan-fg}[D]{/cyan-fg}elete {cyan-fg}[R]{/cyan-fg}ename {cyan-fg}[I]{/cyan-fg}nfo {cyan-fg}[N]{/cyan-fg}ew {cyan-fg}[ESC]{/cyan-fg} Back{/center}\n' +
               `{center}{gray-fg}${files.length} files found{/gray-fg}{/center}`,
      tags: true,
      style: {
        fg: 'white',
        bg: 'black'
      }
    });

    screen.render();

    // Handle input
    const result = await waitForBrowserInput(screen, fileList, files);

    switch (result.action) {
      case 'edit':
        if (result.index >= 0 && result.index < files.length) {
          const selectedFile = files[result.index];
          state.currentFile = selectedFile;
          const content = amigafs.readFileSync(selectedFile.fullPath, 'utf8') as string;
          await openEditor(session, screen, state, content);
        }
        break;
      case 'delete':
        if (result.index >= 0 && result.index < files.length) {
          const file = files[result.index];
          if (state.settings.confirmDelete) {
            const confirm = await confirmDialog(screen, `Delete ${file.filename}?`);
            if (confirm) {
              amigafs.unlinkSync(file.fullPath);
            }
          } else {
            amigafs.unlinkSync(file.fullPath);
          }
        }
        break;
      case 'rename':
        if (result.index >= 0 && result.index < files.length) {
          const file = files[result.index];
          const newName = await promptDialog(screen, 'Rename File', 'New filename:', path.basename(file.filename, path.extname(file.filename)));
          if (newName) {
            const newPath = path.join(state.currentDir, `${newName}${path.extname(file.filename)}`);
            amigafs.renameSync(file.fullPath, newPath);
          }
        }
        break;
      case 'info':
        if (result.index >= 0 && result.index < files.length) {
          await showFileInfo(screen, files[result.index]);
        }
        break;
      case 'new':
        await createNewFile(session, screen, state);
        break;
      case 'back':
        exit = true;
        break;
    }
  }
}

async function showGallery(session: BBSSession, screen: any, state: EditorState): Promise<void> {
  const files = scanDirectory(state.currentDir);

  screen.children.forEach((child: any) => child.destroy());

  const galleryBox = blessed.box({
    parent: screen,
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    content: '{center}{yellow-fg}{bold}ANSI Art Gallery{/bold}{/yellow-fg}\n\n' +
             `{center}${files.length} files found in ${state.currentDir}{/center}\n\n` +
             '{center}{gray-fg}Gallery view with thumbnails coming soon!{/gray-fg}\n' +
             '{center}{gray-fg}For now, use File Browser to view and edit files.{/gray-fg}\n\n' +
             '{center}{cyan-fg}Press any key to return{/cyan-fg}{/center}',
    tags: true,
    style: {
      fg: 'white',
      bg: 'black'
    }
  });

  screen.render();
  await session.waitForKey();
}

async function showSettings(session: BBSSession, screen: any, state: EditorState): Promise<void> {
  let exit = false;
  let selectedSetting = 0;

  while (!exit) {
    screen.children.forEach((child: any) => child.destroy());

    const settingsBox = blessed.box({
      parent: screen,
      top: 'center',
      left: 'center',
      width: 70,
      height: 20,
      label: ' Editor Settings ',
      border: {
        type: 'line',
        fg: 'cyan'
      },
      style: {
        fg: 'white',
        bg: 'black',
        border: {
          fg: 'cyan'
        }
      },
      tags: true
    });

    const settings = [
      { name: 'Auto-save', value: state.settings.autoSave },
      { name: 'Backup on save', value: state.settings.backupOnSave },
      { name: 'Show line numbers', value: state.settings.showLineNumbers },
      { name: 'Show toolbar', value: state.settings.showToolbar },
      { name: 'Show status bar', value: state.settings.showStatusBar },
      { name: 'Confirm delete', value: state.settings.confirmDelete }
    ];

    let content = '\n';
    settings.forEach((setting, idx) => {
      const highlight = selectedSetting === idx;
      const status = setting.value ? '{green-fg}[ON]{/green-fg}' : '{red-fg}[OFF]{/red-fg}';
      if (highlight) {
        content += `  {black-bg}{yellow-fg}► ${setting.name.padEnd(25)} ${status}{/yellow-fg}{/black-bg}\n`;
      } else {
        content += `    ${setting.name.padEnd(25)} ${status}\n`;
      }
    });

    content += '\n{center}{gray-fg}Use arrow keys, Space to toggle, ESC to exit{/gray-fg}{/center}';
    settingsBox.setContent(content);

    screen.render();

    const result = await waitForSettingsInput(screen, settings.length);

    if (result.action === 'toggle') {
      const settingKeys = ['autoSave', 'backupOnSave', 'showLineNumbers', 'showToolbar', 'showStatusBar', 'confirmDelete'] as const;
      const key = settingKeys[result.index];
      state.settings[key] = !state.settings[key];
    } else if (result.action === 'back') {
      exit = true;
    } else if (result.action === 'move') {
      selectedSetting = result.index;
    }
  }
}

async function showHelp(session: BBSSession, screen: any, state: EditorState): Promise<void> {
  screen.children.forEach((child: any) => child.destroy());

  const helpBox = blessed.box({
    parent: screen,
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    label: ' ANSI Editor Help ',
    border: {
        type: 'line',
      fg: 'cyan'
    },
    scrollable: true,
    alwaysScroll: true,
    keys: true,
    vi: true,
    mouse: true,
    scrollbar: {
      ch: '█',
      fg: 'cyan'
    },
    style: {
      fg: 'white',
      bg: 'black',
      border: {
        fg: 'cyan'
      }
    },
    tags: true,
    content: `
{center}{yellow-fg}{bold}AmiExpress ANSI Art Editor - Help{/bold}{/yellow-fg}{/center}

{cyan-fg}{bold}═══ Text Editing Mode ═══{/bold}{/cyan-fg}

  {white-fg}Arrow Keys{/white-fg}     - Move cursor
  {white-fg}Home/End{/white-fg}       - Start/End of line
  {white-fg}PgUp/PgDn{/white-fg}      - Scroll page
  {white-fg}Backspace/Del{/white-fg}  - Delete character
  {white-fg}Enter{/white-fg}          - New line

  {white-fg}Ctrl+S{/white-fg}         - Save file
  {white-fg}Ctrl+M{/white-fg}         - Switch to Draw Mode
  {white-fg}Ctrl+F{/white-fg}         - Find text
  {white-fg}Ctrl+Z{/white-fg}         - Undo
  {white-fg}Ctrl+Y{/white-fg}         - Redo
  {white-fg}F1{/white-fg}             - Show this help
  {white-fg}ESC{/white-fg}            - Exit editor

{cyan-fg}{bold}═══ Drawing Mode (Ctrl+M to switch) ═══{/bold}{/cyan-fg}

  {yellow-fg}Tool Selection:{/yellow-fg}
  {white-fg}1{/white-fg} - Freehand Draw      {white-fg}6{/white-fg} - Filled Ellipse
  {white-fg}2{/white-fg} - Line               {white-fg}7{/white-fg} - Flood Fill
  {white-fg}3{/white-fg} - Box (outline)      {white-fg}8{/white-fg} - Eyedropper/Pick
  {white-fg}4{/white-fg} - Box (filled)       {white-fg}9{/white-fg} - Block Selection
  {white-fg}5{/white-fg} - Ellipse (outline)

  {yellow-fg}Character & Colors:{/yellow-fg}
  {white-fg}C{/white-fg} - Character Picker (256 CP437 chars)
  {white-fg}F{/white-fg} - Foreground Color
  {white-fg}B{/white-fg} - Background Color
  {white-fg}I{/white-fg} - Toggle iCE Colors (16 BG colors + blink)

  {yellow-fg}Other:{/yellow-fg}
  {white-fg}U{/white-fg} - Undo
  {white-fg}Ctrl+Z{/white-fg} - Undo
  {white-fg}Ctrl+L{/white-fg} - Clear Canvas
  {white-fg}Ctrl+M{/white-fg} - Back to Text Mode

{cyan-fg}{bold}═══ File Formats ═══{/bold}{/cyan-fg}

  {white-fg}.ANS{/white-fg} - ANSI art with color codes
  {white-fg}.ASC{/white-fg} - ASCII art (text only)
  {white-fg}.XB{/white-fg}  - XBin format with SAUCE metadata

{cyan-fg}{bold}═══ Advanced Features ═══{/bold}{/cyan-fg}

  • {green-fg}CP437 Extended ASCII{/green-fg} - Full 256-character set
  • {green-fg}16-color palette{/green-fg} - Standard + bright colors
  • {green-fg}iCE colors{/green-fg} - 16 background colors (disable blink)
  • {green-fg}Brush modes{/green-fg} - Half-block, quarter-block patterns
  • {green-fg}Mirror drawing{/green-fg} - Symmetrical art creation
  • {green-fg}SAUCE metadata{/green-fg} - Author, title, group info
  • {green-fg}Undo/Redo{/green-fg} - Full history support

{center}{gray-fg}Press any key to return{/gray-fg}{/center}
`
  });

  screen.render();
  await session.waitForKey();
}

async function openEditor(session: BBSSession, screen: any, state: EditorState, initialContent: string): Promise<void> {
  try {
    const result = await showANSIEditor(session, {
      title: state.currentFile ? `Editing: ${state.currentFile.filename}` : 'New ANSI File',
      initialContent,
      maxLines: 1000,
      maxLineLength: 160,
      showLineNumbers: state.settings.showLineNumbers,
      toolbar: state.settings.showToolbar,
      statusBar: state.settings.showStatusBar,
      onSave: async (content: string) => {
        if (state.currentFile) {
          // Backup if enabled
          if (state.settings.backupOnSave && amigafs.existsSync(state.currentFile.fullPath)) {
            const backupPath = state.currentFile.fullPath + '.bak';
            const original = amigafs.readFileSync(state.currentFile.fullPath);
            amigafs.writeFileSync(backupPath, original);
          }

          // Save file
          amigafs.writeFileSync(state.currentFile.fullPath, content);
          state.modified = false;

          // Update file info
          const stats = amigafs.statSync(state.currentFile.fullPath);
          state.currentFile.size = stats.size;
          state.currentFile.modified = stats.mtime;

          return true;
        }
        return false;
      }
    });

    if (result !== null) {
      state.modified = result !== initialContent;
    }
  } catch (error) {
    await messageDialog(screen, 'Error', `Failed to open editor: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// Helper functions

function scanDirectory(dirPath: string): AnsiFile[] {
  const files: AnsiFile[] = [];

  try {
    const entries = amigafs.readdirSync(dirPath);

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry);
      const stats = amigafs.statSync(fullPath);

      if (stats.isFile()) {
        const ext = path.extname(entry).toLowerCase();
        if (ext === '.ans' || ext === '.asc' || ext === '.xb') {
          files.push({
            filename: entry,
            fullPath,
            size: stats.size,
            modified: stats.mtime
          });
        }
      }
    }
  } catch (error) {
    // Directory doesn't exist or can't be read
  }

  return files.sort((a, b) => a.filename.localeCompare(b.filename));
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
}

async function waitForMenuInput(screen: any, itemCount: number, state: EditorState): Promise<string | number> {
  return new Promise((resolve) => {
    const keyHandler = (_ch: any, key: any) => {
      if (!key) return;

      if (key.name === 'up') {
        state.selectedIndex = (state.selectedIndex - 1 + itemCount) % itemCount;
        screen.render();
      } else if (key.name === 'down') {
        state.selectedIndex = (state.selectedIndex + 1) % itemCount;
        screen.render();
      } else if (key.name === 'return' || key.name === 'enter') {
        screen.unkey(['keypress'], keyHandler);
        resolve(state.selectedIndex);
      } else if (key.name && key.name.length === 1) {
        const letter = key.name.toUpperCase();
        screen.unkey(['keypress'], keyHandler);
        resolve(letter);
      }
    };

    screen.on('keypress', keyHandler);
  });
}

async function waitForBrowserInput(screen: any, list: any, files: AnsiFile[]): Promise<{action: string, index: number}> {
  return new Promise((resolve) => {
    const keyHandler = (_ch: any, key: any) => {
      if (!key) return;

      const selected = list.selected - 1; // -1 for header row

      if (key.name === 'e' && selected >= 0) {
        screen.unkey(['keypress'], keyHandler);
        resolve({ action: 'edit', index: selected });
      } else if (key.name === 'd' && selected >= 0) {
        screen.unkey(['keypress'], keyHandler);
        resolve({ action: 'delete', index: selected });
      } else if (key.name === 'r' && selected >= 0) {
        screen.unkey(['keypress'], keyHandler);
        resolve({ action: 'rename', index: selected });
      } else if (key.name === 'i' && selected >= 0) {
        screen.unkey(['keypress'], keyHandler);
        resolve({ action: 'info', index: selected });
      } else if (key.name === 'n') {
        screen.unkey(['keypress'], keyHandler);
        resolve({ action: 'new', index: -1 });
      } else if (key.name === 'escape') {
        screen.unkey(['keypress'], keyHandler);
        resolve({ action: 'back', index: -1 });
      } else if (key.name === 'return' || key.name === 'enter') {
        screen.unkey(['keypress'], keyHandler);
        resolve({ action: 'edit', index: selected });
      }
    };

    screen.on('keypress', keyHandler);
  });
}

async function waitForSettingsInput(screen: any, settingCount: number): Promise<{action: string, index: number}> {
  let currentIndex = 0;

  return new Promise((resolve) => {
    const keyHandler = (_ch: any, key: any) => {
      if (!key) return;

      if (key.name === 'up') {
        currentIndex = (currentIndex - 1 + settingCount) % settingCount;
        resolve({ action: 'move', index: currentIndex });
      } else if (key.name === 'down') {
        currentIndex = (currentIndex + 1) % settingCount;
        resolve({ action: 'move', index: currentIndex });
      } else if (key.name === 'space') {
        screen.unkey(['keypress'], keyHandler);
        resolve({ action: 'toggle', index: currentIndex });
      } else if (key.name === 'escape') {
        screen.unkey(['keypress'], keyHandler);
        resolve({ action: 'back', index: -1 });
      }
    };

    screen.on('keypress', keyHandler);
  });
}

async function confirmDialog(screen: any, message: string): Promise<boolean> {
  const dialog = blessed.question({
    parent: screen,
    top: 'center',
    left: 'center',
    width: 'shrink',
    height: 'shrink',
    border: {
      type: 'line',
      fg: 'yellow'
    },
    style: {
      fg: 'white',
      bg: 'black',
      border: {
        fg: 'yellow'
      }
    },
    tags: true
  });

  return new Promise((resolve) => {
    dialog.ask(message + ' (y/n)', (err: any, value: any) => {
      dialog.destroy();
      screen.render();
      resolve(value === true || (typeof value === 'string' && value.toLowerCase() === 'y'));
    });
  });
}

async function messageDialog(screen: any, title: string, message: string): Promise<void> {
  const msgBox = blessed.message({
    parent: screen,
    top: 'center',
    left: 'center',
    width: 'shrink',
    height: 'shrink',
    label: ` ${title} `,
    border: {
      type: 'line',
      fg: 'cyan'
    },
    style: {
      fg: 'white',
      bg: 'black',
      border: {
        fg: 'cyan'
      }
    },
    tags: true
  });

  return new Promise((resolve) => {
    msgBox.display(message, 0, () => {
      msgBox.destroy();
      screen.render();
      resolve();
    });
  });
}

async function promptDialog(screen: any, title: string, question: string, defaultValue: string): Promise<string | null> {
  const promptBox = blessed.prompt({
    parent: screen,
    top: 'center',
    left: 'center',
    width: 'shrink',
    height: 'shrink',
    label: ` ${title} `,
    border: {
      type: 'line',
      fg: 'cyan'
    },
    style: {
      fg: 'white',
      bg: 'black',
      border: {
        fg: 'cyan'
      }
    },
    tags: true
  });

  return new Promise((resolve) => {
    promptBox.input(question, defaultValue, (err: any, value: any) => {
      promptBox.destroy();
      screen.render();
      if (err) {
        resolve(null);
      } else {
        resolve(value || null);
      }
    });
  });
}

async function showFileInfo(screen: any, file: AnsiFile): Promise<void> {
  const info = `
{center}{yellow-fg}{bold}File Information{/bold}{/yellow-fg}{/center}

{cyan-fg}Filename:{/cyan-fg}     ${file.filename}
{cyan-fg}Full Path:{/cyan-fg}    ${file.fullPath}
{cyan-fg}Size:{/cyan-fg}         ${formatFileSize(file.size)}
{cyan-fg}Modified:{/cyan-fg}     ${formatDate(file.modified)}
${file.width ? `{cyan-fg}Dimensions:{/cyan-fg}  ${file.width}x${file.height}` : ''}
${file.title ? `{cyan-fg}Title:{/cyan-fg}       ${file.title}` : ''}
${file.author ? `{cyan-fg}Author:{/cyan-fg}      ${file.author}` : ''}
${file.group ? `{cyan-fg}Group:{/cyan-fg}       ${file.group}` : ''}

{center}{gray-fg}Press any key to close{/gray-fg}{/center}
`;

  await messageDialog(screen, 'File Info', info);
}
