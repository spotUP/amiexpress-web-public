/**
 * ANSI Editor - Professional ANSI Art Editor Door
 *
 * Features:
 * - Modern blessed UI with panels and mouse support
 * - File browser with directory navigation
 * - Gallery view with ANSI previews
 * - Full ANSI editor (text + drawing modes)
 * - Settings/preferences
 * - Help system
 */

import { CoreDoor as Door } from '@amiexpress/bbs-door-sdk';
import type { DoorContext } from '@amiexpress/bbs-door-sdk';
import { showANSIEditor } from '@amiexpress/bbs-door-sdk/engines/ui/ansi-editor';
import { Screen, Box, List, Text } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import * as fs from 'fs';
import * as path from 'path';

interface AnsiFile {
  filename: string;
  fullPath: string;
  size: number;
  modified: Date;
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
  modified: boolean;
}

class ANSIEditorUI {
  private ctx!: DoorContext;
  private screen!: Screen;
  private mainBox!: Box;
  private menuList!: List;
  private statusBar!: Text;
  private exitResolve: (() => void) | null = null;
  private hasExited = false;

  private state: EditorState = {
    currentFile: null,
    currentDir: '',
    files: [],
    settings: {
      defaultDir: '',
      autoSave: false,
      backupOnSave: true,
      showLineNumbers: true,
      showToolbar: true,
      showStatusBar: true,
      confirmDelete: true
    },
    modified: false
  };

  setContext(ctx: DoorContext): void {
    this.ctx = ctx;
    this.state.currentDir = path.join(process.cwd(), 'data', 'ansi-art');
    this.state.settings.defaultDir = this.state.currentDir;

    // Ensure directory exists
    if (!fs.existsSync(this.state.currentDir)) {
      fs.mkdirSync(this.state.currentDir, { recursive: true });
    }
  }

  async start(): Promise<void> {
    this.createUI();
    await this.showMainMenu();

    // Wait for exit
    await new Promise<void>((resolve) => {
      const resolver = () => {
        if (!this.hasExited) {
          this.hasExited = true;
          resolve();
        }
      };
      this.exitResolve = resolver;
      this.screen.once('destroy', resolver);
    });
  }

  private createUI(): void {
    this.screen = new Screen({
      smartCSR: true,
      dockBorders: true,
      title: 'ANSI Art Editor',
      output: (data: string) => this.ctx.output.write(data),
      responsive: true,
    });

    // Main container
    this.mainBox = new Box({
      parent: this.screen,
      top: 0,
      left: 0,
      width: '100%',
      height: '100%-3',
      border: { type: 'line', fg: 'cyan' },
      style: { border: { fg: 'cyan' } },
      label: ' {bold}{yellow-fg}AmiExpress ANSI Art Editor{/yellow-fg}{/bold} ',
      tags: true,
    });

    // Menu list
    this.menuList = new List({
      parent: this.mainBox,
      top: 1,
      left: 2,
      width: '100%-4',
      height: '100%-2',
      items: [],
      keys: true,
      mouse: true,
      vi: true,
      style: {
        selected: { bg: 'blue', fg: 'white', bold: true },
        item: { fg: 'white' },
      },
      tags: true,
    });

    // Status bar
    this.statusBar = new Text({
      parent: this.screen,
      bottom: 0,
      left: 0,
      width: '100%',
      height: 3,
      content: '',
      tags: true,
      style: { fg: 'cyan' },
    });

    // Key handlers
    this.screen.key(['q', 'Q', 'escape'], () => {
      this.cleanup();
    });

    this.screen.key(['enter'], () => {
      const index = this.menuList.selected;
      this.handleMenuSelection(index).catch(console.error);
    });
  }

  private async showMainMenu(): Promise<void> {
    const menuItems = [
      '{cyan-fg}[N]{/cyan-fg} New File          - Create a new ANSI art file',
      '{cyan-fg}[O]{/cyan-fg} Open File         - Open an existing file',
      '{cyan-fg}[B]{/cyan-fg} File Browser      - Browse and manage ANSI files',
      '{cyan-fg}[G]{/cyan-fg} Gallery View      - Visual gallery of ANSI art',
      '{cyan-fg}[S]{/cyan-fg} Settings          - Configure editor preferences',
      '{cyan-fg}[H]{/cyan-fg} Help              - Keyboard shortcuts and features',
      '{cyan-fg}[Q]{/cyan-fg} Quit              - Exit ANSI Editor',
    ];

    this.menuList.setItems(menuItems);
    this.updateStatusBar();
    this.screen.render();

    // Letter key shortcuts
    this.screen.key(['n', 'N'], () => this.handleMenuSelection(0).catch(console.error));
    this.screen.key(['o', 'O'], () => this.handleMenuSelection(1).catch(console.error));
    this.screen.key(['b', 'B'], () => this.handleMenuSelection(2).catch(console.error));
    this.screen.key(['g', 'G'], () => this.handleMenuSelection(3).catch(console.error));
    this.screen.key(['s', 'S'], () => this.handleMenuSelection(4).catch(console.error));
    this.screen.key(['h', 'H'], () => this.handleMenuSelection(5).catch(console.error));
  }

  private updateStatusBar(): void {
    const files = this.scanDirectory(this.state.currentDir);
    this.statusBar.setContent(
      `\n {gray-fg}Directory: {white-fg}${this.state.currentDir}{/white-fg}  |  Files: {white-fg}${files.length}{/white-fg}  |  Arrow keys + Enter to select  |  Q to quit{/gray-fg}`
    );
  }

  private async handleMenuSelection(index: number): Promise<void> {
    switch (index) {
      case 0: // New File
        await this.createNewFile();
        break;
      case 1: // Open File
        await this.openFileDialog();
        break;
      case 2: // File Browser
        await this.showFileBrowser();
        break;
      case 3: // Gallery
        await this.showGallery();
        break;
      case 4: // Settings
        await this.showSettings();
        break;
      case 5: // Help
        await this.showHelp();
        break;
      case 6: // Quit
        this.cleanup();
        break;
    }
  }

  private async createNewFile(): Promise<void> {
    // Create input dialog
    const inputBox = new Box({
      parent: this.screen,
      top: 'center',
      left: 'center',
      width: 60,
      height: 7,
      border: { type: 'line', fg: 'yellow' },
      style: { border: { fg: 'yellow' } },
      label: ' {bold}New File{/bold} ',
      tags: true,
    });

    const promptText = new Text({
      parent: inputBox,
      top: 1,
      left: 2,
      content: 'Enter filename (without extension):',
      tags: true,
    });

    this.screen.render();

    // Get filename using SDK input
    const filename = await this.ctx.input.getLine();

    inputBox.destroy();
    this.screen.render();

    if (!filename) return;

    const fullPath = path.join(this.state.currentDir, `${filename}.ans`);

    if (fs.existsSync(fullPath)) {
      await this.showMessage('Error', 'File already exists!', 'red');
      return;
    }

    const newFile: AnsiFile = {
      filename: `${filename}.ans`,
      fullPath,
      size: 0,
      modified: new Date()
    };

    this.state.currentFile = newFile;
    await this.openEditor('');
    this.updateStatusBar();
    this.screen.render();
  }

  private async openFileDialog(): Promise<void> {
    const files = this.scanDirectory(this.state.currentDir);
    if (files.length === 0) {
      await this.showMessage('Info', 'No ANSI files found in current directory.', 'yellow');
      return;
    }

    // Create file list dialog
    const fileBox = new Box({
      parent: this.screen,
      top: 'center',
      left: 'center',
      width: '80%',
      height: '80%',
      border: { type: 'line', fg: 'cyan' },
      style: { border: { fg: 'cyan' } },
      label: ' {bold}Select File{/bold} ',
      tags: true,
    });

    const fileList = new List({
      parent: fileBox,
      top: 1,
      left: 1,
      width: '100%-2',
      height: '100%-2',
      items: files.map((f, idx) => `${(idx + 1).toString().padStart(3)}. ${f.filename.padEnd(30)} ${this.formatFileSize(f.size)}`),
      keys: true,
      mouse: true,
      vi: true,
      style: {
        selected: { bg: 'blue', fg: 'white', bold: true },
        item: { fg: 'white' },
      },
    });

    const closeHandler = () => {
      fileBox.destroy();
      this.screen.render();
    };

    fileList.key(['escape', 'q'], closeHandler);
    fileList.key(['enter'], () => {
      const index = fileList.selected;
      if (index >= 0 && index < files.length) {
        closeHandler();
        const selectedFile = files[index];
        this.state.currentFile = selectedFile;
        const content = fs.readFileSync(selectedFile.fullPath, 'utf8');
        // Don't await here - fire and forget
        this.openEditor(content).then(() => {
          this.updateStatusBar();
          this.screen.render();
        });
      }
    });

    fileList.focus();
    this.screen.render();
  }

  private async showFileBrowser(): Promise<void> {
    await this.openFileDialog();
  }

  private async showGallery(): Promise<void> {
    const files = this.scanDirectory(this.state.currentDir);
    await this.showMessage(
      'Gallery View',
      `${files.length} files found.\n\nGallery view with thumbnails coming soon!\nFor now, use File Browser to view and edit files.`,
      'cyan'
    );
  }

  private async showSettings(): Promise<void> {
    const content = [
      '',
      `  Auto-save:          ${this.state.settings.autoSave ? '{green-fg}ON{/green-fg}' : '{red-fg}OFF{/red-fg}'}`,
      `  Backup on save:     ${this.state.settings.backupOnSave ? '{green-fg}ON{/green-fg}' : '{red-fg}OFF{/red-fg}'}`,
      `  Show line numbers:  ${this.state.settings.showLineNumbers ? '{green-fg}ON{/green-fg}' : '{red-fg}OFF{/red-fg}'}`,
      `  Show toolbar:       ${this.state.settings.showToolbar ? '{green-fg}ON{/green-fg}' : '{red-fg}OFF{/red-fg}'}`,
      `  Show status bar:    ${this.state.settings.showStatusBar ? '{green-fg}ON{/green-fg}' : '{red-fg}OFF{/red-fg}'}`,
      `  Confirm delete:     ${this.state.settings.confirmDelete ? '{green-fg}ON{/green-fg}' : '{red-fg}OFF{/red-fg}'}`,
      '',
      '{gray-fg}Settings are configured in this session{/gray-fg}',
    ].join('\n');

    await this.showMessage('Editor Settings', content, 'cyan');
  }

  private async showHelp(): Promise<void> {
    const content = [
      '',
      '{cyan-fg}{bold}Text Editing Mode{/bold}{/cyan-fg}',
      '  Arrow Keys     - Move cursor',
      '  Ctrl+S         - Save file',
      '  Ctrl+M         - Switch to Draw Mode',
      '  ESC            - Exit editor',
      '',
      '{cyan-fg}{bold}Drawing Mode{/bold}{/cyan-fg}',
      '  1-9            - Select drawing tool',
      '  C              - Character picker',
      '  F/B            - Foreground/Background color',
      '  I              - Toggle iCE colors',
      '  U              - Undo',
      '  Ctrl+M         - Back to Text Mode',
      '',
      '{cyan-fg}{bold}Drawing Tools{/bold}{/cyan-fg}',
      '  1 - Freehand    6 - Filled Ellipse',
      '  2 - Line        7 - Flood Fill',
      '  3 - Box         8 - Eyedropper',
      '  4 - Box Filled  9 - Block Select',
      '  5 - Ellipse',
    ].join('\n');

    await this.showMessage('ANSI Editor Help', content, 'yellow');
  }

  private async showMessage(title: string, message: string, color: string): Promise<void> {
    const msgBox = new Box({
      parent: this.screen,
      top: 'center',
      left: 'center',
      width: 70,
      height: 'shrink',
      border: { type: 'line', fg: color },
      style: { border: { fg: color } },
      label: ` {bold}${title}{/bold} `,
      tags: true,
      padding: { left: 2, right: 2, top: 1, bottom: 1 },
    });

    new Text({
      parent: msgBox,
      top: 0,
      left: 0,
      content: message + '\n\n{center}{gray-fg}Press any key to continue{/gray-fg}{/center}',
      tags: true,
    });

    this.screen.render();

    // Wait for key press
    await this.ctx.input.waitForKey();

    msgBox.destroy();
    this.screen.render();
  }

  private async openEditor(initialContent: string): Promise<void> {
    try {
      // Hide main menu
      this.mainBox.hide();
      this.statusBar.hide();
      this.screen.render();

      const result = await showANSIEditor(this.ctx.bbsSession as any, {
        title: this.state.currentFile ? `Editing: ${this.state.currentFile.filename}` : 'New ANSI File',
        initialContent,
        maxLines: 1000,
        maxLineLength: 160,
        showLineNumbers: this.state.settings.showLineNumbers,
        toolbar: this.state.settings.showToolbar,
        statusBar: this.state.settings.showStatusBar,
        onSave: async (content: string) => {
          if (this.state.currentFile) {
            if (this.state.settings.backupOnSave && fs.existsSync(this.state.currentFile.fullPath)) {
              const backupPath = this.state.currentFile.fullPath + '.bak';
              const original = fs.readFileSync(this.state.currentFile.fullPath);
              fs.writeFileSync(backupPath, original);
            }

            fs.writeFileSync(this.state.currentFile.fullPath, content);
            this.state.modified = false;

            const stats = fs.statSync(this.state.currentFile.fullPath);
            this.state.currentFile.size = stats.size;
            this.state.currentFile.modified = stats.mtime;

            return true;
          }
          return false;
        }
      });

      if (result !== null) {
        this.state.modified = result !== initialContent;
      }
    } catch (error) {
      await this.showMessage('Error', error instanceof Error ? error.message : String(error), 'red');
    } finally {
      // Restore main menu
      this.mainBox.show();
      this.statusBar.show();
      this.screen.render();
    }
  }

  private scanDirectory(dirPath: string): AnsiFile[] {
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

  private formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  }

  private cleanup(): void {
    if (this.hasExited) return;
    this.hasExited = true;

    if (this.screen && !this.screen.destroyed) {
      this.screen.destroy();
    }

    if (this.exitResolve) {
      this.exitResolve();
    }

    this.ctx.close();
  }
}

const door = new Door({
  name: 'ANSI Editor',
  version: '1.0.0',
  description: 'Professional ANSI Art Editor with file management',
  author: 'AmiExpress SDK v2.0',
});

door.onStart(async (ctx: DoorContext) => {
  const editor = new ANSIEditorUI();
  editor.setContext(ctx);
  await editor.start();
});

door.onClose(async (ctx: DoorContext) => {
  // Cleanup handled by ANSIEditorUI
});

door.onError(async (ctx: DoorContext, error: Error) => {
  ctx.output.writeLine(`\r\n\x1b[31mError in ANSI Editor: ${error.message}\x1b[0m\r\n`);
});

export default door;
