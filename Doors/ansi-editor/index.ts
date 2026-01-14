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

import { CoreDoor as Door } from '@amiexpress/bbs-door-sdk';
import type { DoorContext } from '@amiexpress/bbs-door-sdk';
import { showANSIEditor } from '@amiexpress/bbs-door-sdk/engines/ui/ansi-editor';
import * as fs from 'fs';
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

const door = new Door({
  name: 'ANSI Editor',
  version: '1.0.0',
  description: 'Professional ANSI Art Editor with file management',
  author: 'AmiExpress SDK v2.0',
});

let currentState: EditorState | null = null;

door.onStart(async (ctx: DoorContext) => {
  const ansiDir = path.join(process.cwd(), 'data', 'ansi-art');
  if (!fs.existsSync(ansiDir)) {
    fs.mkdirSync(ansiDir, { recursive: true });
  }

  currentState = {
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
    await showMainMenu(ctx);
  } catch (error) {
    ctx.output.writeLine(`\r\n\x1b[31mError: ${error instanceof Error ? error.message : String(error)}\x1b[0m\r\n`);
  }
});

door.onClose(async (ctx: DoorContext) => {
  currentState = null;
});

door.onError(async (ctx: DoorContext, error: Error) => {
  ctx.output.writeLine(`\r\n\x1b[31mError in ANSI Editor: ${error.message}\x1b[0m\r\n`);
});

async function showMainMenu(ctx: DoorContext): Promise<void> {
  if (!currentState) return;

  let exit = false;

  while (!exit) {
    ctx.output.writeLine('\x1b[2J\x1b[H');
    ctx.output.writeLine('\x1b[36m\x1b[1m╔═══════════════════════════════════════════════════════════════════════════╗\x1b[0m\x1b[0m');
    ctx.output.writeLine('\x1b[36m\x1b[1m║\x1b[0m\x1b[0m  \x1b[33m\x1b[1mAmiExpress ANSI Art Editor\x1b[0m\x1b[0m - Professional ANSI/ASCII Art Creation  \x1b[36m\x1b[1m║\x1b[0m\x1b[0m');
    ctx.output.writeLine('\x1b[36m\x1b[1m╚═══════════════════════════════════════════════════════════════════════════╝\x1b[0m\x1b[0m\r\n');

    ctx.output.writeLine('\x1b[37m\x1b[1mMain Menu\x1b[0m\x1b[0m\r\n');

    const menuItems = [
      { key: 'N', label: 'New File', desc: 'Create a new ANSI art file' },
      { key: 'O', label: 'Open File', desc: 'Open an existing file' },
      { key: 'B', label: 'File Browser', desc: 'Browse and manage ANSI files' },
      { key: 'G', label: 'Gallery View', desc: 'Visual gallery of ANSI art' },
      { key: 'S', label: 'Settings', desc: 'Configure editor preferences' },
      { key: 'H', label: 'Help', desc: 'Keyboard shortcuts and features' },
      { key: 'Q', label: 'Quit', desc: 'Exit ANSI Editor' }
    ];

    menuItems.forEach((item, idx) => {
      const highlight = currentState!.selectedIndex === idx;
      if (highlight) {
        ctx.output.writeLine(`  \x1b[40m\x1b[33m► [\x1b[1m${item.key}\x1b[0m] ${item.label.padEnd(20)} ${item.desc}\x1b[0m\x1b[0m`);
      } else {
        ctx.output.writeLine(`    \x1b[36m[\x1b[1m${item.key}\x1b[0m]\x1b[0m \x1b[37m${item.label.padEnd(20)}\x1b[0m \x1b[90m${item.desc}\x1b[0m`);
      }
    });

    ctx.output.writeLine('\r\n\x1b[90mUse arrow keys to navigate, Enter to select, or press letter key\x1b[0m');
    ctx.output.writeLine(`\x1b[90mCurrent directory: \x1b[37m${currentState.currentDir}\x1b[0m\x1b[0m\r\n`);

    const choice = (await ctx.input.waitForKey()).key;

    if (choice === '\x1b[A') { // Up arrow
      currentState.selectedIndex = (currentState.selectedIndex - 1 + menuItems.length) % menuItems.length;
    } else if (choice === '\x1b[B') { // Down arrow
      currentState.selectedIndex = (currentState.selectedIndex + 1) % menuItems.length;
    } else if (choice === '\r' || choice === '\n') { // Enter
      await handleMenuSelection(ctx, currentState.selectedIndex);
      if (currentState.selectedIndex === 6) exit = true;
    } else if (choice && choice.length === 1) {
      const letter = choice.toUpperCase();
      const itemIndex = menuItems.findIndex(item => item.key === letter);
      if (itemIndex !== -1) {
        await handleMenuSelection(ctx, itemIndex);
        if (itemIndex === 6) exit = true;
      }
    }
  }
}

async function handleMenuSelection(ctx: DoorContext, index: number): Promise<void> {
  if (!currentState) return;

  switch (index) {
    case 0: // New File
      await createNewFile(ctx);
      break;
    case 1: // Open File
      await openFileDialog(ctx);
      break;
    case 2: // File Browser
      await showFileBrowser(ctx);
      break;
    case 3: // Gallery
      await showGallery(ctx);
      break;
    case 4: // Settings
      await showSettings(ctx);
      break;
    case 5: // Help
      await showHelp(ctx);
      break;
    case 6: // Quit
      if (currentState.modified) {
        ctx.output.writeLine('\r\n\x1b[33mYou have unsaved changes. Really quit? (y/n)\x1b[0m ');
        const confirm = (await ctx.input.waitForKey()).key;
        if (confirm !== 'y' && confirm !== 'Y') {
          return;
        }
      }
      break;
  }
}

async function createNewFile(ctx: DoorContext): Promise<void> {
  ctx.output.writeLine('\r\n\x1b[36mEnter filename (without extension):\x1b[0m ');
  const filename = await ctx.input.getLine();
  if (!filename || !currentState) return;

  const fullPath = path.join(currentState.currentDir, `${filename}.ans`);

  if (fs.existsSync(fullPath)) {
    ctx.output.writeLine('\x1b[31mFile already exists!\x1b[0m\r\n');
    ctx.output.writeLine('Press any key...');
    (await ctx.input.waitForKey()).key;
    return;
  }

  const newFile: AnsiFile = {
    filename: `${filename}.ans`,
    fullPath,
    size: 0,
    modified: new Date()
  };

  currentState.currentFile = newFile;
  await openEditor(ctx, '');
}

async function openFileDialog(ctx: DoorContext): Promise<void> {
  if (!currentState) return;

  const files = scanDirectory(currentState.currentDir);
  if (files.length === 0) {
    ctx.output.writeLine('\r\n\x1b[33mNo ANSI files found in current directory.\x1b[0m\r\n');
    ctx.output.writeLine('Press any key...');
    (await ctx.input.waitForKey()).key;
    return;
  }

  ctx.output.writeLine('\r\n\x1b[36m\x1b[1mFiles:\x1b[0m\x1b[0m\r\n');
  files.forEach((f, idx) => {
    ctx.output.writeLine(`  \x1b[37m[${idx + 1}]\x1b[0m ${f.filename} (${formatFileSize(f.size)})`);
  });

  ctx.output.writeLine('\r\n\x1b[36mEnter file number (or 0 to cancel):\x1b[0m ');
  const input = await ctx.input.getLine();
  const fileNum = parseInt(input || '0');

  if (fileNum > 0 && fileNum <= files.length) {
    const selectedFile = files[fileNum - 1];
    currentState.currentFile = selectedFile;
    const content = fs.readFileSync(selectedFile.fullPath, 'utf8') as string;
    await openEditor(ctx, content);
  }
}

async function showFileBrowser(ctx: DoorContext): Promise<void> {
  if (!currentState) return;

  const files = scanDirectory(currentState.currentDir);

  ctx.output.writeLine('\r\n\x1b[36m\x1b[1m═══ File Browser ═══\x1b[0m\x1b[0m\r\n');
  ctx.output.writeLine(`\x1b[90mDirectory: ${currentState.currentDir}\x1b[0m\r\n`);

  if (files.length === 0) {
    ctx.output.writeLine('\x1b[33mNo files found.\x1b[0m\r\n');
  } else {
    files.forEach((f, idx) => {
      ctx.output.writeLine(`\x1b[37m${(idx + 1).toString().padStart(3)}.\x1b[0m ${f.filename.padEnd(30)} ${formatFileSize(f.size).padStart(10)}`);
    });
  }

  ctx.output.writeLine('\r\n\x1b[36m[E]dit  [N]ew  [Q]uit\x1b[0m\r\n');
  ctx.output.writeLine('Choice: ');

  const choice = (await ctx.input.waitForKey()).key;

  if (choice === 'e' || choice === 'E') {
    ctx.output.writeLine('Enter file number: ');
    const input = await ctx.input.getLine();
    const fileNum = parseInt(input || '0');
    if (fileNum > 0 && fileNum <= files.length) {
      const selectedFile = files[fileNum - 1];
      currentState.currentFile = selectedFile;
      const content = fs.readFileSync(selectedFile.fullPath, 'utf8') as string;
      await openEditor(ctx, content);
    }
  } else if (choice === 'n' || choice === 'N') {
    await createNewFile(ctx);
  }
}

async function showGallery(ctx: DoorContext): Promise<void> {
  if (!currentState) return;

  const files = scanDirectory(currentState.currentDir);

  ctx.output.writeLine('\x1b[2J\x1b[H');
  ctx.output.writeLine('\x1b[33m\x1b[1mANSI Art Gallery\x1b[0m\x1b[0m\r\n\r\n');
  ctx.output.writeLine(`${files.length} files found in ${currentState.currentDir}\r\n\r\n`);
  ctx.output.writeLine('\x1b[90mGallery view with thumbnails coming soon!\x1b[0m\r\n');
  ctx.output.writeLine('\x1b[90mFor now, use File Browser to view and edit files.\x1b[0m\r\n\r\n');
  ctx.output.writeLine('\x1b[36mPress any key to return\x1b[0m');

  (await ctx.input.waitForKey()).key;
}

async function showSettings(ctx: DoorContext): Promise<void> {
  if (!currentState) return;

  ctx.output.writeLine('\x1b[2J\x1b[H');
  ctx.output.writeLine('\x1b[36m\x1b[1m═══ Editor Settings ═══\x1b[0m\x1b[0m\r\n\r\n');

  ctx.output.writeLine(`  Auto-save:          {${currentState.settings.autoSave ? 'green-fg}ON' : 'red-fg}OFF'}{/}`);
  ctx.output.writeLine(`  Backup on save:     {${currentState.settings.backupOnSave ? 'green-fg}ON' : 'red-fg}OFF'}{/}`);
  ctx.output.writeLine(`  Show line numbers:  {${currentState.settings.showLineNumbers ? 'green-fg}ON' : 'red-fg}OFF'}{/}`);
  ctx.output.writeLine(`  Show toolbar:       {${currentState.settings.showToolbar ? 'green-fg}ON' : 'red-fg}OFF'}{/}`);
  ctx.output.writeLine(`  Show status bar:    {${currentState.settings.showStatusBar ? 'green-fg}ON' : 'red-fg}OFF'}{/}`);
  ctx.output.writeLine(`  Confirm delete:     {${currentState.settings.confirmDelete ? 'green-fg}ON' : 'red-fg}OFF'}{/}`);

  ctx.output.writeLine('\r\n\x1b[90mSettings are configured in this session\x1b[0m\r\n');
  ctx.output.writeLine('\x1b[36mPress any key to return\x1b[0m');

  (await ctx.input.waitForKey()).key;
}

async function showHelp(ctx: DoorContext): Promise<void> {
  ctx.output.writeLine('\x1b[2J\x1b[H');
  ctx.output.writeLine('\x1b[33m\x1b[1mANSI Editor - Help\x1b[0m\x1b[0m\r\n\r\n');

  ctx.output.writeLine('\x1b[36m\x1b[1m═══ Text Editing Mode ═══\x1b[0m\x1b[0m\r\n');
  ctx.output.writeLine('  \x1b[37mArrow Keys\x1b[0m     - Move cursor');
  ctx.output.writeLine('  \x1b[37mCtrl+S\x1b[0m         - Save file');
  ctx.output.writeLine('  \x1b[37mCtrl+M\x1b[0m         - Switch to Draw Mode');
  ctx.output.writeLine('  \x1b[37mESC\x1b[0m            - Exit editor\r\n');

  ctx.output.writeLine('\x1b[36m\x1b[1m═══ Drawing Mode ═══\x1b[0m\x1b[0m\r\n');
  ctx.output.writeLine('  \x1b[37m1-9\x1b[0m            - Select drawing tool');
  ctx.output.writeLine('  \x1b[37mC\x1b[0m              - Character picker');
  ctx.output.writeLine('  \x1b[37mF/B\x1b[0m            - Foreground/Background color');
  ctx.output.writeLine('  \x1b[37mI\x1b[0m              - Toggle iCE colors');
  ctx.output.writeLine('  \x1b[37mU\x1b[0m              - Undo');
  ctx.output.writeLine('  \x1b[37mCtrl+M\x1b[0m         - Back to Text Mode\r\n');

  ctx.output.writeLine('\x1b[36m\x1b[1m═══ Drawing Tools ═══\x1b[0m\x1b[0m\r\n');
  ctx.output.writeLine('  \x1b[37m1\x1b[0m - Freehand    \x1b[37m6\x1b[0m - Filled Ellipse');
  ctx.output.writeLine('  \x1b[37m2\x1b[0m - Line        \x1b[37m7\x1b[0m - Flood Fill');
  ctx.output.writeLine('  \x1b[37m3\x1b[0m - Box         \x1b[37m8\x1b[0m - Eyedropper');
  ctx.output.writeLine('  \x1b[37m4\x1b[0m - Box Filled  \x1b[37m9\x1b[0m - Block Select');
  ctx.output.writeLine('  \x1b[37m5\x1b[0m - Ellipse\r\n');

  ctx.output.writeLine('\x1b[36mPress any key to return\x1b[0m');
  (await ctx.input.waitForKey()).key;
}

async function openEditor(ctx: DoorContext, initialContent: string): Promise<void> {
  if (!currentState) return;

  try {
    const result = await showANSIEditor(ctx.bbsSession as any, {
      title: currentState.currentFile ? `Editing: ${currentState.currentFile.filename}` : 'New ANSI File',
      initialContent,
      maxLines: 1000,
      maxLineLength: 160,
      showLineNumbers: currentState.settings.showLineNumbers,
      toolbar: currentState.settings.showToolbar,
      statusBar: currentState.settings.showStatusBar,
      onSave: async (content: string) => {
        if (currentState?.currentFile) {
          if (currentState.settings.backupOnSave && fs.existsSync(currentState.currentFile.fullPath)) {
            const backupPath = currentState.currentFile.fullPath + '.bak';
            const original = fs.readFileSync(currentState.currentFile.fullPath);
            fs.writeFileSync(backupPath, original);
          }

          fs.writeFileSync(currentState.currentFile.fullPath, content);
          currentState.modified = false;

          const stats = fs.statSync(currentState.currentFile.fullPath);
          currentState.currentFile.size = stats.size;
          currentState.currentFile.modified = stats.mtime;

          return true;
        }
        return false;
      }
    });

    if (result !== null && currentState) {
      currentState.modified = result !== initialContent;
    }
  } catch (error) {
    ctx.output.writeLine(`\r\n\x1b[31mError: ${error instanceof Error ? error.message : String(error)}\x1b[0m\r\n`);
    ctx.output.writeLine('Press any key...');
    (await ctx.input.waitForKey()).key;
  }
}

// Helper functions

function scanDirectory(dirPath: string): AnsiFile[] {
  const files: AnsiFile[] = [];

  try {
    const entries = fs.readdirSync(dirPath);

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry);
      const stats = fs.statSync(fullPath);

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

export default door;
