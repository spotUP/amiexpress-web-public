// @ts-nocheck
/**
 * Neo-Blessed modal dialogs for ANSI Editor
 * Professional UI overlays using SDK UI engine
 */

import { UIEngine, UIHelpers } from '@amiexpress/bbs-door-sdk';
import { Tool, COLOR_NAMES, DRAW_CHARS, SHORTCUTS } from './types.js';

// Use any for blessed elements to avoid type conflicts between SDK and @types/blessed
type BlessedBox = any;
type BlessedElement = any;

// =============================================================================
// BASE MODAL CLASS
// =============================================================================

export abstract class BaseModal {
  protected ui: UIEngine;
  protected helpers: UIHelpers;
  protected container: BlessedBox | null = null;
  protected result: any = null;

  constructor(ui: UIEngine) {
    this.ui = ui;
    this.helpers = new UIHelpers(ui);
  }

  abstract show(): Promise<any>;

  protected close(): void {
    if (this.container) {
      this.container.destroy();
      this.container = null;
      this.ui.render(true);
    }
  }
}

// =============================================================================
// TOOL SELECTOR MODAL
// =============================================================================

export class ToolSelectorModal extends BaseModal {
  constructor(ui: UIEngine, private currentTool: Tool) {
    super(ui);
  }

  async show(): Promise<Tool | null> {
    return new Promise((resolve) => {
      const toolOptions = [
        { label: 'Draw', value: 'draw' as Tool, icon: '*', desc: 'Freehand drawing' },
        { label: 'Line', value: 'line' as Tool, icon: '/', desc: 'Draw straight lines' },
        { label: 'Box', value: 'box' as Tool, icon: '#', desc: 'Draw rectangles' },
        { label: 'Box Fill', value: 'box-fill' as Tool, icon: '█', desc: 'Filled rectangles' },
        { label: 'Ellipse', value: 'ellipse' as Tool, icon: 'O', desc: 'Draw ellipse outline' },
        { label: 'Ellipse Fill', value: 'ellipse-fill' as Tool, icon: '0', desc: 'Filled ellipse' },
        { label: 'Text', value: 'text' as Tool, icon: 'T', desc: 'Type text mode' },
        { label: 'Fill', value: 'fill' as Tool, icon: '@', desc: 'Flood fill area' },
        { label: 'Pick', value: 'pick' as Tool, icon: '+', desc: 'Pick color/char' },
        { label: 'Select', value: 'select' as Tool, icon: 'S', desc: 'Select region' },
        { label: 'Shifter', value: 'shifter' as Tool, icon: '<', desc: 'Shift half-blocks' },
      ];

      this.container = this.ui.createBox({
        top: 'center',
        left: 'center',
        width: 55,
        height: 18,
        label: ' SELECT TOOL ',
        border: { type: 'line' },
        style: {
          fg: 'white',
          bg: 'blue',
          border: { fg: 'cyan' },
        },
        shadow: true,
      });

      const list = this.ui.createList({
        parent: this.container,
        top: 0,
        left: 0,
        width: 53,
        height: 14,
        wrapItems: false,
        items: toolOptions.map(t => ` ${t.icon}  ${t.label.padEnd(12)} ${t.desc}`),
        keys: true,
        vi: true,
        mouse: true,
        style: {
          selected: {
            bg: 'cyan',
            fg: 'black',
          },
        },
      });

      // Set selected index to current tool
      const currentIndex = toolOptions.findIndex(t => t.value === this.currentTool);
      if (currentIndex >= 0) {
        list.select(currentIndex);
      }

      // Handle selection
      list.on('select', (_: any, index: number) => {
        this.result = toolOptions[index].value;
        this.close();
        resolve(this.result);
      });

      // Handle keyboard shortcuts
      list.key(['escape'], () => {
        this.result = null;
        this.close();
        resolve(null);
      });

      // Show help
      this.ui.createText({
        parent: this.container,
        bottom: 0,
        left: 1,
        content: 'ARROWS: Navigate | ENTER: Select | ESC: Cancel',
        style: { fg: 'yellow' },
      });

      list.focus();
      this.ui.render(true);
    });
  }
}

// =============================================================================
// COLOR PICKER MODAL
// =============================================================================

export class ColorPickerModal extends BaseModal {
  constructor(
    ui: UIEngine,
    private currentFg: number,
    private currentBg: number,
    private iceColorsEnabled: boolean
  ) {
    super(ui);
  }

  async show(): Promise<{ fg: number; bg: number } | null> {
    return new Promise((resolve) => {
      this.container = this.ui.createBox({
        top: 'center',
        left: 'center',
        width: 72,
        height: 24,
        label: ` COLOR PICKER ${this.iceColorsEnabled ? '[iCE COLORS]' : ''} `,
        border: { type: 'line' },
        style: {
          fg: 'white',
          bg: 'blue',
          border: { fg: 'cyan' },
        },
        shadow: true,
      });

      let selectedFg = this.currentFg;
      let selectedBg = this.currentBg;
      let mode: 'fg' | 'bg' = 'fg';

      // Foreground color list (all 16 colors)
      const fgList = this.ui.createList({
        parent: this.container,
        top: 2,
        left: 2,
        width: 32,
        height: 18,
        label: ' Foreground ',
        border: { type: 'line' },
        wrapItems: false,
        items: COLOR_NAMES.map((name, i) => `${i.toString().padStart(2)}: ${name}`),
        keys: true,
        mouse: true,
        style: {
          selected: { bg: 'cyan', fg: 'black' },
          border: { fg: 'green' },
        },
      });

      // Background color list (8 or 16 depending on iCE mode)
      const bgColorCount = this.iceColorsEnabled ? 16 : 8;
      const bgList = this.ui.createList({
        parent: this.container,
        top: 2,
        right: 2,
        width: 32,
        height: 18,
        label: ' Background ',
        border: { type: 'line' },
        wrapItems: false,
        items: COLOR_NAMES.slice(0, bgColorCount).map((name, i) =>
          `${i.toString().padStart(2)}: ${name}`
        ),
        keys: true,
        mouse: true,
        style: {
          selected: { bg: 'cyan', fg: 'black' },
          border: { fg: 'white' },
        },
      });

      // Set initial selections
      fgList.select(selectedFg);
      bgList.select(selectedBg);

      // Preview box
      const preview = this.ui.createBox({
        parent: this.container,
        bottom: 0,
        left: 2,
        width: 68,
        height: 1,
        content: ' PREVIEW: Press ENTER to confirm, ESC to cancel ',
      });

      const updatePreview = () => {
        // Build color preview string
        let content = ' ';
        for (let i = 0; i < 10; i++) {
          content += '█';
        }
        content += ' ';
        preview.setContent(content);

        // Update preview colors (this is simplified - in real implementation
        // would use proper ANSI codes)
        preview.style.fg = COLOR_NAMES[selectedFg].toLowerCase();
        preview.style.bg = COLOR_NAMES[selectedBg].toLowerCase();
      };

      // Handle foreground selection
      fgList.on('select', (_: any, index: number) => {
        selectedFg = index;
        updatePreview();
        this.ui.render();
      });

      // Handle background selection
      bgList.on('select', (_: any, index: number) => {
        selectedBg = index;
        updatePreview();
        this.ui.render();
      });

      // Tab to switch between fg/bg
      const switchFocus = () => {
        if (mode === 'fg') {
          mode = 'bg';
          bgList.focus();
          bgList.style.border!.fg = 'green';
          fgList.style.border!.fg = 'white';
        } else {
          mode = 'fg';
          fgList.focus();
          fgList.style.border!.fg = 'green';
          bgList.style.border!.fg = 'white';
        }
        this.ui.render();
      };

      fgList.key(['tab'], switchFocus);
      bgList.key(['tab'], switchFocus);

      // Confirm selection
      const confirm = () => {
        this.result = { fg: selectedFg, bg: selectedBg };
        this.close();
        resolve(this.result);
      };

      fgList.key(['enter'], confirm);
      bgList.key(['enter'], confirm);

      // Cancel
      const cancel = () => {
        this.result = null;
        this.close();
        resolve(null);
      };

      fgList.key(['escape'], cancel);
      bgList.key(['escape'], cancel);

      fgList.focus();
      updatePreview();
      this.ui.render(true);
    });
  }
}

// =============================================================================
// FILE DIALOG MODAL
// =============================================================================

export class FileDialogModal extends BaseModal {
  constructor(
    ui: UIEngine,
    private title: string,
    private files: string[],
    private action: 'open' | 'save'
  ) {
    super(ui);
  }

  async show(): Promise<string | null> {
    return new Promise((resolve) => {
      this.container = this.ui.createBox({
        top: 'center',
        left: 'center',
        width: 60,
        height: 20,
        label: ` ${this.title} `,
        border: { type: 'line' },
        style: {
          fg: 'white',
          bg: 'blue',
          border: { fg: 'cyan' },
        },
        shadow: true,
      });

      const list = this.ui.createList({
        parent: this.container,
        top: 0,
        left: 0,
        width: 58,
        height: 16,
        wrapItems: false,
        items: this.files.length > 0 ? this.files : ['<No files found>'],
        keys: true,
        vi: true,
        mouse: true,
        style: {
          selected: { bg: 'cyan', fg: 'black' },
        },
      });

      // Input for filename (for save)
      let filenameInput: BlessedElement | null = null;
      if (this.action === 'save') {
        this.ui.createText({
          parent: this.container,
          bottom: 2,
          left: 2,
          content: 'Filename:',
          style: { fg: 'yellow' },
        });

        filenameInput = this.ui.createTextbox({
          parent: this.container,
          bottom: 1,
          left: 12,
          width: 44,
          height: 1,
          border: { type: 'line' },
          style: {
            fg: 'white',
            bg: 'black',
          },
        });
      }

      // Handle selection
      list.on('select', (_: any, index: number) => {
        if (this.files.length > 0) {
          this.result = this.files[index];
          this.close();
          resolve(this.result);
        }
      });

      // Handle save with filename
      if (filenameInput) {
        filenameInput.on('submit', () => {
          const filename = filenameInput!.getValue();
          if (filename) {
            this.result = filename;
            this.close();
            resolve(this.result);
          }
        });
      }

      // Cancel
      list.key(['escape'], () => {
        this.result = null;
        this.close();
        resolve(null);
      });

      list.focus();
      this.ui.render(true);
    });
  }
}

// =============================================================================
// CONFIRM DIALOG
// =============================================================================

export class ConfirmDialog extends BaseModal {
  constructor(
    ui: UIEngine,
    private title: string,
    private message: string
  ) {
    super(ui);
  }

  async show(): Promise<boolean> {
    return new Promise((resolve) => {
      this.container = this.ui.createBox({
        top: 'center',
        left: 'center',
        width: 50,
        height: 10,
        label: ` ${this.title} `,
        border: { type: 'line' },
        content: `\n  ${this.message}\n`,
        style: {
          fg: 'white',
          bg: 'blue',
          border: { fg: 'yellow' },
        },
        shadow: true,
      });

      const yesButton = this.ui.createButton({
        parent: this.container,
        bottom: 1,
        left: 8,
        width: 10,
        height: 3,
        content: ' Yes ',
        border: { type: 'line' },
        style: {
          fg: 'white',
          bg: 'green',
          focus: { bg: 'cyan' },
        },
      });

      const noButton = this.ui.createButton({
        parent: this.container,
        bottom: 1,
        right: 8,
        width: 10,
        height: 3,
        content: ' No ',
        border: { type: 'line' },
        style: {
          fg: 'white',
          bg: 'red',
          focus: { bg: 'cyan' },
        },
      });

      yesButton.on('press', () => {
        this.result = true;
        this.close();
        resolve(true);
      });

      noButton.on('press', () => {
        this.result = false;
        this.close();
        resolve(false);
      });

      yesButton.key(['enter', 'y'], () => yesButton.press());
      noButton.key(['escape', 'n'], () => noButton.press());

      yesButton.focus();
      this.ui.render(true);
    });
  }
}

// =============================================================================
// MESSAGE DIALOG
// =============================================================================

export class MessageDialog extends BaseModal {
  constructor(
    ui: UIEngine,
    private title: string,
    private message: string,
    private type: 'info' | 'warning' | 'error' = 'info'
  ) {
    super(ui);
  }

  async show(): Promise<void> {
    return new Promise((resolve) => {
      const borderColor = this.type === 'error' ? 'red' : this.type === 'warning' ? 'yellow' : 'cyan';

      this.container = this.ui.createBox({
        top: 'center',
        left: 'center',
        width: 50,
        height: 10,
        label: ` ${this.title} `,
        border: { type: 'line' },
        content: `\n  ${this.message}\n`,
        style: {
          fg: 'white',
          bg: 'blue',
          border: { fg: borderColor },
        },
        shadow: true,
      });

      const okButton = this.ui.createButton({
        parent: this.container,
        bottom: 1,
        left: 'center',
        width: 10,
        height: 3,
        content: ' OK ',
        border: { type: 'line' },
        style: {
          fg: 'white',
          bg: 'blue',
          focus: { bg: 'cyan' },
        },
      });

      okButton.on('press', () => {
        this.close();
        resolve();
      });

      okButton.key(['enter', 'escape'], () => okButton.press());

      okButton.focus();
      this.ui.render(true);
    });
  }
}

// =============================================================================
// HELP DIALOG
// =============================================================================

export class HelpDialog extends BaseModal {
  async show(): Promise<void> {
    return new Promise((resolve) => {
      this.container = this.ui.createBox({
        top: 'center',
        left: 'center',
        width: 75,
        height: 22,
        label: ' ANSI EDITOR HELP ',
        border: { type: 'line' },
        style: {
          fg: 'white',
          bg: 'blue',
          border: { fg: 'cyan' },
        },
        shadow: true,
        scrollable: true,
        alwaysScroll: true,
        keys: true,
        vi: true,
        mouse: true,
      });

      const helpText = `
                     ANSI EDITOR - COMPLETE REFERENCE GUIDE

 NOTE: All hotkeys work on both PC and Mac. Alternative keys provided where
 OS hotkeys conflict (e.g., [ ] keys for color cycling work on all platforms).

 === CURSOR MOVEMENT ===
   Arrow Keys - Move cursor one cell
   Shift+Arrows - Move cursor and create/extend selection
   Home - Jump to start of current line
   End - Jump to end of current line
   Page Up - Jump to top of canvas (row 0)
   Page Down - Jump to bottom of canvas (row 21)

 === BASIC EDITING ===
   Printable chars - Type character at cursor position
   Space - Draw current character (useful in draw mode)
   Backspace - Delete character at cursor and move back
   Delete - Delete character under cursor
   Insert - Toggle insert/overwrite mode (status bar shows INS/OVR)
   Enter - Move to next line (insert mode)
   Escape - Cancel selection, exit text mode, or show this help

 === DRAWING TOOLS ===
   Tab - Show tool selector modal (choose from all tools)
   Shift+Tab - Cycle backwards through tools
   D - Draw mode: freehand drawing with mouse or keyboard
   L - Line mode: draw straight lines between two points
   B - Box mode: draw rectangles (outline or filled)
   E - Ellipse mode: draw circles and ellipses
   T - Text mode: type text strings anywhere on canvas
   F - Fill mode: flood fill enclosed areas
   P - Pick mode: sample colors/character from canvas (Alt+U)
   S - Shifter mode: shift cells with arrow keys
   H - Shifter mode (alternate key)

 === BRUSH CONTROL (Draw Mode Only) ===
   1-9 - Set brush size (1=single cell, 9=large brush)
   [ ] - Cycle brush mode (half-block/shading/colorize/custom/replace)

 === COLOR CONTROL ===
   F1-F8 - Set foreground color (0-7: Black/Red/Green/Yellow/Blue/Mag/Cyan/White)
   Shift+F1-F8 - Set background color (0-7)
   [ ] - Cycle foreground color
   - = - Cycle background color
   K - Show color picker modal (interactive selector)
   Alt+U - Sample colors and character from cell under cursor

 === SELECTION & CLIPBOARD ===
   S - Start block selection mode (toggle on/off)
   Shift+Arrows - Extend selection while moving cursor
   Ctrl+A - Select all (entire canvas)
   Ctrl+X - Cut selection (removes and copies to clipboard)
   Ctrl+C - Copy selection to clipboard
   Ctrl+V - Paste from clipboard at cursor position
   Escape - Cancel/clear current selection

 === SELECTION OPERATIONS (WHEN SELECTED) ===
   M - Move selection (cut and prepare for paste)
   F - Fill selection with current foreground color
   E / Delete - Erase selection (clear to spaces)
   R - Rotate selection 90 degrees clockwise
   X - Flip selection horizontally
   Y - Flip selection vertically
   = - Center selection horizontally on canvas

 === LINE OPERATIONS ===
   Alt+L - Left justify current line (remove leading spaces)
   Alt+R - Right justify current line (move content to right edge)
   Alt+C - Center current line horizontally
   Alt+E - Erase entire current line (fill with spaces)
   Alt+Home - Erase from start of line to cursor
   Alt+End - Erase from cursor to end of line

 === ROW & COLUMN OPERATIONS ===
   Alt+Up - Insert blank row at cursor position
   Alt+Down - Delete current row (shift rows up)
   Alt+Right - Insert blank column at cursor position
   Alt+Left - Delete current column (shift columns left)
   Alt+Shift+E - Erase entire column at cursor
   Alt+PageUp - Erase from top of column to cursor
   Alt+PageDown - Erase from cursor to bottom of column

 === UNDO & REDO ===
   Ctrl+Z - Undo last operation (100 levels)
   Ctrl+Y - Redo previously undone operation
   (Continuous typing is grouped into single undo operation)

 === FILE OPERATIONS ===
   Ctrl+S - Save file (choose filename and format)
   Ctrl+O - Load file from BBS file area
   Ctrl+I - Import file as selection (loads into clipboard)
   Ctrl+E - Export selection to file
   Q - Quit editor (prompts to save if modified)
   (Supports .ANS, .ASC, .TXT, .XB, .BIN, .DIZ formats)
   (Auto-saves backups every 5 minutes)

 === ADVANCED FEATURES ===
   Alt+M - Toggle mirror mode (horizontal symmetry drawing)
   G - Cycle guide overlays (80x25, 80x40, 44x22, grid, none)
   Alt+N - Toggle numpad drawing mode (keyboard directional drawing)

 === STATUS BAR INFO ===
   Shows: Tool | Position | Colors | Character | iCE | F-Keys | Mirror | NumPad | Guide | File
   * = Modified (unsaved changes)
   MIR = Mirror mode active  |  NUM = Numpad drawing active
   Guide types: 80X25, 80X40, 44X22, GRID, or ----- (none)

 === MOUSE SUPPORT ===
   Left Click - Draw at clicked position (draw mode)
   Click+Drag - Continuous drawing while dragging
   Right Click - Sample colors from clicked cell

 === TIPS & TRICKS ===
   - Use Tab tool selector for quick access to all tools
   - Insert mode adds characters, overwrite mode replaces them
   - Status bar shows current character code (helpful for graphics chars)
   - Selection dimensions appear in status bar when selecting
   - Canvas size is 80 columns x 22 rows (standard ANSI terminal)
   - Use shifter tool to move content without redrawing
   - Undo is chunked: rapid edits group into single undo operation
   - Mirror mode creates perfect symmetry for logos and borders
   - Guide overlays help align content to common BBS layouts

            Use Arrow Up/Down to scroll - ESC or ENTER to close
      `;

      this.container.setContent(helpText);

      this.container.key(['escape', 'enter', 'q'], () => {
        this.close();
        resolve();
      });

      this.container.focus();
      this.ui.render(true);
    });
  }
}

// =============================================================================
// GALLERY BROWSER MODAL (from old editor)
// =============================================================================

export class GalleryBrowserModal extends BaseModal {
  constructor(ui: UIEngine, private files: string[]) {
    super(ui);
  }

  async show(): Promise<string | null> {
    return new Promise((resolve) => {
      this.container = this.ui.createBox({
        top: 'center',
        left: 'center',
        width: 70,
        height: 20,
        label: ' BBS SCREENS GALLERY ',
        border: { type: 'line' },
        style: {
          fg: 'white',
          bg: 'blue',
          border: { fg: 'cyan' },
        },
        shadow: true,
      });

      // Format file list with nice display names
      const fileItems = this.files.map(f => {
        const name = f.replace(/\.(txt|ans|asc|bin|xb)$/i, '');
        const ext = f.split('.').pop()?.toUpperCase() || '';
        return `${name.padEnd(40)} [${ext}]`;
      });

      const list = this.ui.createList({
        parent: this.container,
        top: 1,
        left: 1,
        width: 66,
        height: 14,
        wrapItems: false,
        items: fileItems,
        keys: true,
        vi: true,
        mouse: true,
        scrollable: true,
        scrollbar: {
          ch: ' ',
          style: {
            bg: 'blue',
          },
        },
        style: {
          selected: {
            bg: 'cyan',
            fg: 'black',
          },
        },
      });

      // Instructions
      const instructions = this.ui.createText({
        parent: this.container,
        bottom: 1,
        left: 2,
        content: 'Enter - Load and edit | Esc - Cancel',
        style: {
          fg: 'yellow',
        },
      });

      // Handle selection
      list.on('select', (item: any, index: number) => {
        this.close();
        resolve(this.files[index]);
      });

      list.key(['escape', 'q'], () => {
        this.close();
        resolve(null);
      });

      list.focus();
      this.ui.render(true);
    });
  }
}

// =============================================================================
// RECENT FILES MODAL (from old editor)
// =============================================================================

export class RecentFilesModal extends BaseModal {
  constructor(ui: UIEngine, private recentFiles: string[]) {
    super(ui);
  }

  async show(): Promise<string | null> {
    return new Promise((resolve) => {
      this.container = this.ui.createBox({
        top: 'center',
        left: 'center',
        width: 60,
        height: 16,
        label: ' RECENT FILES ',
        border: { type: 'line' },
        style: {
          fg: 'white',
          bg: 'blue',
          border: { fg: 'cyan' },
        },
        shadow: true,
      });

      // If no recent files, show empty message
      if (this.recentFiles.length === 0) {
        const emptyMsg = this.ui.createText({
          parent: this.container,
          top: 'center',
          left: 'center',
          content: 'No recent files',
          style: {
            fg: 'gray',
          },
        });

        this.container.key(['escape', 'enter', 'q'], () => {
          this.close();
          resolve(null);
        });

        this.container.focus();
        this.ui.render(true);
        return;
      }

      // Format file list with nice display names
      const fileItems = this.recentFiles.map(f => {
        const name = f.replace(/\.(txt|ans|asc|bin|xb)$/i, '');
        const ext = f.split('.').pop()?.toUpperCase() || '';
        return `${name.padEnd(35)} [${ext}]`;
      });

      const list = this.ui.createList({
        parent: this.container,
        top: 1,
        left: 1,
        width: 56,
        height: 10,
        wrapItems: false,
        items: fileItems,
        keys: true,
        vi: true,
        mouse: true,
        scrollable: true,
        scrollbar: {
          ch: ' ',
          style: {
            bg: 'blue',
          },
        },
        style: {
          selected: {
            bg: 'cyan',
            fg: 'black',
          },
        },
      });

      // Instructions
      const instructions = this.ui.createText({
        parent: this.container,
        bottom: 1,
        left: 2,
        content: 'Enter - Load file | Esc - Cancel',
        style: {
          fg: 'yellow',
        },
      });

      // Handle selection
      list.on('select', (item: any, index: number) => {
        this.close();
        resolve(this.recentFiles[index]);
      });

      list.key(['escape', 'q'], () => {
        this.close();
        resolve(null);
      });

      list.focus();
      this.ui.render(true);
    });
  }
}