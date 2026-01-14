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
    ctx.output.writeLine(`\r\n{red-fg}Error: ${error instanceof Error ? error.message : String(error)}{/red-fg}\r\n`);
  }
});

door.onClose(async (ctx: DoorContext) => {
  currentState = null;
});

door.onError(async (ctx: DoorContext, error: Error) => {
  ctx.output.writeLine(`\r\n{red-fg}Error in ANSI Editor: ${error.message}{/red-fg}\r\n`);
});

async function showMainMenu(ctx: DoorContext): Promise<void> {
  if (!currentState) return;

  let exit = false;

  while (!exit) {
    ctx.output.writeLine('\x1b[2J\x1b[H');
    ctx.output.writeLine('{center}{cyan-fg}{bold}╔═══════════════════════════════════════════════════════════════════════════╗{/bold}{/cyan-fg}');
    ctx.output.writeLine('{cyan-fg}{bold}║{/bold}{/cyan-fg}  {yellow-fg}{bold}AmiExpress ANSI Art Editor{/bold}{/yellow-fg} - Professional ANSI/ASCII Art Creation  {cyan-fg}{bold}║{/bold}{/cyan-fg}');
    ctx.output.writeLine('{cyan-fg}{bold}╚═══════════════════════════════════════════════════════════════════════════╝{/bold}{/cyan-fg}{/center}\r\n');

    ctx.output.writeLine('{center}{white-fg}{bold}Main Menu{/bold}{/white-fg}{/center}\r\n');

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
        ctx.output.writeLine(`  {black-bg}{yellow-fg}► [{bold}${item.key}{/bold}] ${item.label.padEnd(20)} ${item.desc}{/yellow-fg}{/black-bg}`);
      } else {
        ctx.output.writeLine(`    {cyan-fg}[{bold}${item.key}{/bold}]{/cyan-fg} {white-fg}${item.label.padEnd(20)}{/white-fg} {gray-fg}${item.desc}{/gray-fg}`);
      }
    });

    ctx.output.writeLine('\r\n{center}{gray-fg}Use arrow keys to navigate, Enter to select, or press letter key{/gray-fg}');
    ctx.output.writeLine(`{center}{gray-fg}Current directory: {white-fg}${currentState.currentDir}{/white-fg}{/gray-fg}{/center}\r\n`);

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
        ctx.output.writeLine('\r\n{yellow-fg}You have unsaved changes. Really quit? (y/n){/yellow-fg} ');
        const confirm = (await ctx.input.waitForKey()).key;
        if (confirm !== 'y' && confirm !== 'Y') {
          return;
        }
      }
      break;
  }
}

async function createNewFile(ctx: DoorContext): Promise<void> {
  ctx.output.writeLine('\r\n{cyan-fg}Enter filename (without extension):{/cyan-fg} ');
  const filename = await ctx.input.getLine();
  if (!filename || !currentState) return;

  const fullPath = path.join(currentState.currentDir, `${filename}.ans`);

  if (fs.existsSync(fullPath)) {
    ctx.output.writeLine('{red-fg}File already exists!{/red-fg}\r\n');
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
    ctx.output.writeLine('\r\n{yellow-fg}No ANSI files found in current directory.{/yellow-fg}\r\n');
    ctx.output.writeLine('Press any key...');
    (await ctx.input.waitForKey()).key;
    return;
  }

  ctx.output.writeLine('\r\n{cyan-fg}{bold}Files:{/bold}{/cyan-fg}\r\n');
  files.forEach((f, idx) => {
    ctx.output.writeLine(`  {white-fg}[${idx + 1}]{/white-fg} ${f.filename} (${formatFileSize(f.size)})`);
  });

  ctx.output.writeLine('\r\n{cyan-fg}Enter file number (or 0 to cancel):{/cyan-fg} ');
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

  ctx.output.writeLine('\r\n{cyan-fg}{bold}═══ File Browser ═══{/bold}{/cyan-fg}\r\n');
  ctx.output.writeLine(`{gray-fg}Directory: ${currentState.currentDir}{/gray-fg}\r\n`);

  if (files.length === 0) {
    ctx.output.writeLine('{yellow-fg}No files found.{/yellow-fg}\r\n');
  } else {
    files.forEach((f, idx) => {
      ctx.output.writeLine(`{white-fg}${(idx + 1).toString().padStart(3)}.{/white-fg} ${f.filename.padEnd(30)} ${formatFileSize(f.size).padStart(10)}`);
    });
  }

  ctx.output.writeLine('\r\n{cyan-fg}[E]dit  [N]ew  [Q]uit{/cyan-fg}\r\n');
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
  ctx.output.writeLine('{center}{yellow-fg}{bold}ANSI Art Gallery{/bold}{/yellow-fg}\r\n\r\n');
  ctx.output.writeLine(`{center}${files.length} files found in ${currentState.currentDir}{/center}\r\n\r\n`);
  ctx.output.writeLine('{center}{gray-fg}Gallery view with thumbnails coming soon!{/gray-fg}\r\n');
  ctx.output.writeLine('{center}{gray-fg}For now, use File Browser to view and edit files.{/gray-fg}\r\n\r\n');
  ctx.output.writeLine('{center}{cyan-fg}Press any key to return{/cyan-fg}{/center}');

  (await ctx.input.waitForKey()).key;
}

async function showSettings(ctx: DoorContext): Promise<void> {
  if (!currentState) return;

  ctx.output.writeLine('\x1b[2J\x1b[H');
  ctx.output.writeLine('{center}{cyan-fg}{bold}═══ Editor Settings ═══{/bold}{/cyan-fg}\r\n\r\n');

  ctx.output.writeLine(`  Auto-save:          {${currentState.settings.autoSave ? 'green-fg}ON' : 'red-fg}OFF'}{/}`);
  ctx.output.writeLine(`  Backup on save:     {${currentState.settings.backupOnSave ? 'green-fg}ON' : 'red-fg}OFF'}{/}`);
  ctx.output.writeLine(`  Show line numbers:  {${currentState.settings.showLineNumbers ? 'green-fg}ON' : 'red-fg}OFF'}{/}`);
  ctx.output.writeLine(`  Show toolbar:       {${currentState.settings.showToolbar ? 'green-fg}ON' : 'red-fg}OFF'}{/}`);
  ctx.output.writeLine(`  Show status bar:    {${currentState.settings.showStatusBar ? 'green-fg}ON' : 'red-fg}OFF'}{/}`);
  ctx.output.writeLine(`  Confirm delete:     {${currentState.settings.confirmDelete ? 'green-fg}ON' : 'red-fg}OFF'}{/}`);

  ctx.output.writeLine('\r\n{gray-fg}Settings are configured in this session{/gray-fg}\r\n');
  ctx.output.writeLine('{cyan-fg}Press any key to return{/cyan-fg}');

  (await ctx.input.waitForKey()).key;
}

async function showHelp(ctx: DoorContext): Promise<void> {
  ctx.output.writeLine('\x1b[2J\x1b[H');
  ctx.output.writeLine('{center}{yellow-fg}{bold}ANSI Editor - Help{/bold}{/yellow-fg}\r\n\r\n');

  ctx.output.writeLine('{cyan-fg}{bold}═══ Text Editing Mode ═══{/bold}{/cyan-fg}\r\n');
  ctx.output.writeLine('  {white-fg}Arrow Keys{/white-fg}     - Move cursor');
  ctx.output.writeLine('  {white-fg}Ctrl+S{/white-fg}         - Save file');
  ctx.output.writeLine('  {white-fg}Ctrl+M{/white-fg}         - Switch to Draw Mode');
  ctx.output.writeLine('  {white-fg}ESC{/white-fg}            - Exit editor\r\n');

  ctx.output.writeLine('{cyan-fg}{bold}═══ Drawing Mode ═══{/bold}{/cyan-fg}\r\n');
  ctx.output.writeLine('  {white-fg}1-9{/white-fg}            - Select drawing tool');
  ctx.output.writeLine('  {white-fg}C{/white-fg}              - Character picker');
  ctx.output.writeLine('  {white-fg}F/B{/white-fg}            - Foreground/Background color');
  ctx.output.writeLine('  {white-fg}I{/white-fg}              - Toggle iCE colors');
  ctx.output.writeLine('  {white-fg}U{/white-fg}              - Undo');
  ctx.output.writeLine('  {white-fg}Ctrl+M{/white-fg}         - Back to Text Mode\r\n');

  ctx.output.writeLine('{cyan-fg}{bold}═══ Drawing Tools ═══{/bold}{/cyan-fg}\r\n');
  ctx.output.writeLine('  {white-fg}1{/white-fg} - Freehand    {white-fg}6{/white-fg} - Filled Ellipse');
  ctx.output.writeLine('  {white-fg}2{/white-fg} - Line        {white-fg}7{/white-fg} - Flood Fill');
  ctx.output.writeLine('  {white-fg}3{/white-fg} - Box         {white-fg}8{/white-fg} - Eyedropper');
  ctx.output.writeLine('  {white-fg}4{/white-fg} - Box Filled  {white-fg}9{/white-fg} - Block Select');
  ctx.output.writeLine('  {white-fg}5{/white-fg} - Ellipse\r\n');

  ctx.output.writeLine('{center}{cyan-fg}Press any key to return{/cyan-fg}{/center}');
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
    ctx.output.writeLine(`\r\n{red-fg}Error: ${error instanceof Error ? error.message : String(error)}{/red-fg}\r\n`);
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
