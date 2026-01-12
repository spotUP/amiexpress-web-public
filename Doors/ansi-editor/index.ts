/**
 * ANSI Editor SDK - State-of-the-art ANSI/ASCII art editor
 * Complete Moebius feature parity with modern enhancements
 *
 * Features:
 * - Full drawing toolset (draw, line, box, ellipse, fill, text, pick, select, shifter)
 * - Mouse and keyboard input support
 * - Undo/redo system with chunked operations
 * - Selection and clipboard (copy, cut, paste, transform)
 * - Neo-Blessed modal dialogs for professional UI
 * - Multiple file format support (ANS, ASC, BIN, XB, TXT)
 * - iCE colors support (16 background colors + blink)
 * - Guides and grid overlays
 * - Color picker with full palette
 * - Real-time canvas rendering
 */

import { CoreDoor as Door } from '@amiexpress/bbs-door-sdk';
import { UIEngine, DoorContext, KeyPress } from '@amiexpress/bbs-door-sdk';

import { EditorState, Tool, ANSI, SHORTCUTS, Cell } from './types.js';
import {
  createCanvas,
  saveUndoState,
  flushUndoChunk,
  undo,
  redo,
  startSelection,
  updateSelection,
  clearSelection,
  copySelection,
  cutSelection,
  pasteSelection,
  selectAll,
  flipSelectionHorizontal,
  flipSelectionVertical,
  rotateSelection90,
  shiftSelection,
  renderCanvas,
  renderStatusBar,
  clearCanvas,
} from './canvas.js';
import {
  getToolHandler,
  insertTextChar,
  shiftHalfBlock,
} from './drawing.js';
import {
  ToolSelectorModal,
  ColorPickerModal,
  FileDialogModal,
  ConfirmDialog,
  MessageDialog,
  HelpDialog,
  GalleryBrowserModal,
  RecentFilesModal,
} from './modals.js';
import {
  loadFile,
  saveFile,
  listFiles,
  fileExists,
  importFile,
  exportSelection,
} from './file-ops.js';

// =============================================================================
// ANSI EDITOR DOOR
// =============================================================================

const door = new Door({
  name: 'ANSI Editor',
  version: '2.0.0',
  author: 'AmiExpress-Web',
  description: 'State-of-the-art ANSI/ASCII art editor with full Moebius features',
});

// =============================================================================
// EDITOR STATE INITIALIZATION
// =============================================================================

function createInitialState(): EditorState {
  return {
    // Canvas
    canvas: createCanvas(80, 22), // 22 lines for editing (2 for status)
    width: 80,
    height: 22,

    // Cursor
    cursorX: 0,
    cursorY: 0,
    cursorVisible: true,

    // Drawing state
    currentFg: 7,
    currentBg: 0,
    currentChar: '█',
    currentTool: 'draw',
    brushMode: 'half-block',
    operationMode: 'normal',

    // Brush state (from old editor)
    brushSize: 1,  // 1-9
    mirrorModeEnabled: false,
    numpadModeEnabled: false,
    straightLineMode: false,

    // iCE colors and attributes
    iceColorsEnabled: false,
    blinkEnabled: false,

    // Undo/redo
    undoStack: [],
    redoStack: [],
    maxUndoLevels: 100,
    lastUndoTime: 0,
    undoChunkTimeout: 1000,
    pendingUndoChunk: false,

    // Selection
    selecting: false,
    selectionStart: null,
    selectionEnd: null,
    clipboard: [],

    // Viewport state (for large canvases)
    viewportX: 0,
    viewportY: 0,

    // UI state
    showGuide: 'none',
    showStatusBar: true,
    showColorPalette: false,
    showToolbar: true,
    gridSpacing: 10,
    currentFKeySet: 'normal' as 'normal' | 'shift',

    // File state
    currentFilename: null,
    modified: false,
    lastSavedCanvas: null,
    insertMode: true,

    // Auto-save state (from old editor)
    autoSaveEnabled: true,
    autoSaveIntervalMs: 5 * 60 * 1000,  // 5 minutes

    // Drawing state for tools
    drawingStartPoint: null,
    drawingEndPoint: null,
    drawingPreview: null,

    // Mouse state
    mouseDown: false,
    lastMouseX: 0,
    lastMouseY: 0,
  };
}

// =============================================================================
// MAIN EDITOR CLASS
// =============================================================================

class ANSIEditor {
  private state: EditorState;
  private ui: UIEngine;
  private running: boolean = false;
  private ctx: DoorContext;

  constructor(ctx: DoorContext) {
    this.ctx = ctx;
    this.state = createInitialState();

    // Create UI engine for modals
    this.ui = new UIEngine({
      width: 80,
      height: 24,
      smartCSR: true,
      enableMouse: true,
      enableKeys: true,
      output: (data: string) => { /* Capture via getOutput() instead */ }
    });
  }

  // ===========================================================================
  // INITIALIZATION
  // ===========================================================================

  async init(): Promise<void> {
    this.running = true;

    // Setup event routing from UI engine to socket
    this.ui.on('render', () => {
      const output = this.ui.getOutput();
      if (output) {
        this.emit(output);
      }
    });

    // Key events (now coming from our UIEngine/blessed)
    this.ui.on('keypress', (ch: string, key: any) => {
      const focused = this.ui.getScreen().getFocused();
      if (!focused || focused === this.ui.getScreen()) {
        this.handleKeypress(ch, key);
      }
    });

    // Initial screen draw
    this.emit(ANSI.CLEAR_SCREEN);
    this.emit(ANSI.HIDE_CURSOR);
    this.refresh();

    // Show welcome message
    // Note: We don't await this here because it would block initialization
    // Instead, we let it run in the background
    this.showWelcome().then(() => {
        // Enable mouse support after welcome modal is closed
        if ((this.ctx.bbs as any)?.enableMouseEvents) {
          (this.ctx.bbs as any).enableMouseEvents();
        }
    });

    // Handle mouse events from socket
    this.ctx.socket.on('mouse', (event: any) => {
      this.handleMouse(event);
    });
  }

  /**
   * Main input entry point called by Door.onInput
   */
  public handleInput(key: KeyPress): void {
    if (!this.running) return;

    // 1. Feed to UIEngine for modals/blessed widgets
    this.ui.getScreen()._handleData(key.raw);
    
    // 2. Handle canvas drawing if no modal is active
    const focused = this.ui.getScreen().getFocused();
    if (!focused || focused === this.ui.getScreen()) {
       // Only call handleKeyboard for printable single characters
       if (key.raw.length === 1 && key.raw.charCodeAt(0) >= 32) {
         this.handleKeyboard(key.raw);
       } else if (key.raw === '\x1b') {
         // ESC
         this.handleKeyboard(key.raw);
       }
    }
  }

  // ===========================================================================
  // KEYBOARD HANDLING
  // ===========================================================================

  private handleKeyboard(data: string): void {
    // Handle raw keyboard data
    if (data.length === 1) {
      const char = data;

      // In text mode, insert characters
      if (this.state.currentTool === 'text') {
        insertTextChar(this.state, char);
        this.refresh();
        return;
      }

      // Tool shortcuts
      switch (char.toLowerCase()) {
        case 'd':
          this.setTool('draw');
          break;
        case 'l':
          this.setTool('line');
          break;
        case 'b':
          this.setTool('box');
          break;
        case 'e':
          this.setTool('ellipse');
          break;
        case 't':
          this.setTool('text');
          break;
        case 'f':
          this.setTool('fill');
          break;
        case 'p':
          this.setTool('pick');
          break;
        case 's':
          this.setTool('select');
          break;
        case 'h':
          this.setTool('shifter');
          break;
        case 'k':
          this.showColorPicker();
          break;
        case 'g':
          this.toggleGuides();
          break;
        case 'i':
          this.toggleIceColors();
          break;
        case 'q':
          this.quit();
          break;
      }
    }

    // Handle escape sequences
    if (data === '\x1b') {
      // ESC - cancel current operation
      const handler = getToolHandler(this.state.currentTool);
      handler.onCancel(this.state);
      clearSelection(this.state);
      this.refresh();
    }
  }

  private async handleKeypress(ch: string, key: any): Promise<void> {
    const { name, ctrl, alt, shift } = key;

    // Arrow keys - move cursor
    if (name === 'left') {
      this.moveCursor(-1, 0);
    } else if (name === 'right') {
      this.moveCursor(1, 0);
    } else if (name === 'up') {
      this.moveCursor(0, -1);
    } else if (name === 'down') {
      this.moveCursor(0, 1);
    }

    // Page Up/Down
    else if (name === 'pageup') {
      this.moveCursor(0, -10);
    } else if (name === 'pagedown') {
      this.moveCursor(0, 10);
    }

    // Home/End
    else if (name === 'home') {
      this.state.cursorX = 0;
      this.refresh();
    } else if (name === 'end') {
      this.state.cursorX = this.state.width - 1;
      this.refresh();
    }

    // Ctrl+Z - Undo
    else if (ctrl && name === 'z') {
      if (undo(this.state)) {
        this.refresh();
      }
    }

    // Ctrl+Y - Redo
    else if (ctrl && name === 'y') {
      if (redo(this.state)) {
        this.refresh();
      }
    }

    // Ctrl+C - Copy
    else if (ctrl && name === 'c') {
      if (copySelection(this.state)) {
        await this.showMessage('Selection copied to clipboard');
      }
    }

    // Ctrl+X - Cut
    else if (ctrl && name === 'x') {
      if (cutSelection(this.state)) {
        this.refresh();
        await this.showMessage('Selection cut to clipboard');
      }
    }

    // Ctrl+V - Paste
    else if (ctrl && name === 'v') {
      pasteSelection(this.state);
      this.refresh();
    }

    // Ctrl+A - Select All
    else if (ctrl && name === 'a') {
      selectAll(this.state);
      this.refresh();
    }

    // Ctrl+N - New File
    else if (ctrl && name === 'n') {
      await this.newFile();
    }

    // Ctrl+O - Open File
    else if (ctrl && name === 'o') {
      await this.openFile();
    }

    // Ctrl+S - Save File
    else if (ctrl && name === 's') {
      await this.saveCurrentFile();
    }

    // Delete - Delete selection
    else if (name === 'delete') {
      if (this.state.selecting) {
        const handler = getToolHandler(this.state.currentTool);
        handler.onCancel(this.state);
        clearSelection(this.state);
        this.refresh();
      }
    }

    // Tab - Show tool selector
    else if (name === 'tab') {
      await this.showToolSelector();
    }

    // F1 - Help
    else if (name === 'f1') {
      await this.showHelp();
    }

    // Shifter tool shortcuts
    else if (this.state.currentTool === 'shifter') {
      if (name === 'left') {
        shiftHalfBlock(this.state, 'left');
        this.refresh();
      } else if (name === 'right') {
        shiftHalfBlock(this.state, 'right');
        this.refresh();
      }
    }
  }

  // ===========================================================================
  // MOUSE HANDLING
  // ===========================================================================

  private handleMouse(event: any): void {
    const { x, y, button, action } = event;

    // Convert to canvas coordinates (0-indexed, accounting for status bar)
    const canvasX = Math.max(0, Math.min(this.state.width - 1, x - 1));
    const canvasY = Math.max(0, Math.min(this.state.height - 1, y - 1));

    if (canvasY >= this.state.height) {
      // Clicked on status bar - ignore
      return;
    }

    // Update cursor position
    this.state.cursorX = canvasX;
    this.state.cursorY = canvasY;

    // Get current tool handler
    const handler = getToolHandler(this.state.currentTool);

    // Handle mouse actions
    if (action === 'mousedown') {
      this.state.mouseDown = true;
      this.state.lastMouseX = canvasX;
      this.state.lastMouseY = canvasY;
      handler.onStart(this.state, canvasX, canvasY);
      this.refresh();
    } else if (action === 'mousemove') {
      if (this.state.mouseDown) {
        handler.onMove(this.state, canvasX, canvasY);
        this.refresh();
      }
    } else if (action === 'mouseup') {
      if (this.state.mouseDown) {
        handler.onEnd(this.state, canvasX, canvasY);
        this.state.mouseDown = false;
        this.refresh();
      }
    }

    // Update selection if in select mode
    if (this.state.currentTool === 'select' && this.state.selecting) {
      updateSelection(this.state);
      this.refresh();
    }
  }

  // ===========================================================================
  // RENDERING
  // ===========================================================================

  private refresh(): void {
    // 1. Render canvas + status bar
    let output = renderCanvas(this.state);
    if (this.state.showStatusBar) {
      output += renderStatusBar(this.state);
    }
    this.emit(output);

    // 2. If a modal is up, re-render it on top to ensure visibility
    const focused = this.ui.getScreen().getFocused();
    if (focused && focused !== this.ui.getScreen()) {
      this.ui.render(true);
      const modalOutput = this.ui.getOutput();
      if (modalOutput) {
        this.emit(modalOutput);
      }
    }
  }

  private emit(data: string): void {
    void this.ctx.output.write(data);
  }

  // ===========================================================================
  // TOOL MANAGEMENT
  // ===========================================================================

  private setTool(tool: Tool): void {
    // Flush any pending undo chunks
    flushUndoChunk(this.state);

    // Cancel current tool operation
    const oldHandler = getToolHandler(this.state.currentTool);
    oldHandler.onCancel(this.state);

    // Clear selection
    clearSelection(this.state);

    // Set new tool
    this.state.currentTool = tool;

    // Show tool change message
    this.showStatusMessage(`Tool: ${tool.toUpperCase()}`);
    this.refresh();
  }

  private async showToolSelector(): Promise<void> {
    const modal = new ToolSelectorModal(this.ui, this.state.currentTool);
    const result = await modal.show();

    if (result) {
      this.setTool(result);
    } else {
      this.refresh();
    }
  }

  private async showColorPicker(): Promise<void> {
    const modal = new ColorPickerModal(
      this.ui,
      this.state.currentFg,
      this.state.currentBg,
      this.state.iceColorsEnabled
    );

    const result = await modal.show();

    if (result) {
      this.state.currentFg = result.fg;
      this.state.currentBg = result.bg;
    }

    this.refresh();
  }

  // ===========================================================================
  // FILE OPERATIONS
  // ===========================================================================

  private async newFile(): Promise<void> {
    if (this.state.modified) {
      const modal = new ConfirmDialog(
        this.ui,
        'New File',
        'Current file has unsaved changes. Continue?'
      );

      if (!(await modal.show())) {
        this.refresh();
        return;
      }
    }

    clearCanvas(this.state);
    this.state.currentFilename = null;
    this.state.modified = false;
    this.state.undoStack = [];
    this.state.redoStack = [];

    await this.showMessage('New file created');
    this.refresh();
  }

  private async openFile(): Promise<void> {
    const files = listFiles();

    if (files.length === 0) {
      await this.showMessage('No files found', 'warning');
      this.refresh();
      return;
    }

    const modal = new FileDialogModal(this.ui, 'Open File', files, 'open');
    const filename = await modal.show();

    if (filename) {
      try {
        await loadFile(this.state, filename);
        await this.showMessage(`Loaded: ${filename}`);
      } catch (error) {
        await this.showMessage(`Error: ${(error as Error).message}`, 'error');
      }
    }

    this.refresh();
  }

  private async saveCurrentFile(): Promise<void> {
    if (!this.state.currentFilename) {
      await this.saveFileAs();
      return;
    }

    try {
      await saveFile(this.state, this.state.currentFilename);
      await this.showMessage(`Saved: ${this.state.currentFilename}`);
    } catch (error) {
      await this.showMessage(`Error: ${(error as Error).message}`, 'error');
    }

    this.refresh();
  }

  private async saveFileAs(): Promise<void> {
    const files = listFiles();
    const modal = new FileDialogModal(this.ui, 'Save As', files, 'save');
    const filename = await modal.show();

    if (filename) {
      try {
        await saveFile(this.state, filename);
        await this.showMessage(`Saved: ${filename}`);
      } catch (error) {
        await this.showMessage(`Error: ${(error as Error).message}`, 'error');
      }
    }

    this.refresh();
  }

  // ===========================================================================
  // UI HELPERS
  // ===========================================================================

  private async showWelcome(): Promise<void> {
    const modal = new MessageDialog(
      this.ui,
      'ANSI Editor',
      'State-of-the-art ANSI/ASCII art editor\n\nPress F1 for help\nPress Tab for tools',
      'info'
    );

    await modal.show();
    this.refresh();
  }

  private async showHelp(): Promise<void> {
    const modal = new HelpDialog(this.ui);
    await modal.show();
    this.refresh();
  }

  private async showMessage(
    message: string,
    type: 'info' | 'warning' | 'error' = 'info'
  ): Promise<void> {
    const modal = new MessageDialog(this.ui, type.toUpperCase(), message, type);
    await modal.show();
  }

  private showStatusMessage(message: string): void {
    // Show brief status message (would be on status bar)
    // For now, just included in status bar rendering
  }

  // ===========================================================================
  // UTILITY METHODS
  // ===========================================================================

  private moveCursor(dx: number, dy: number): void {
    this.state.cursorX = Math.max(0, Math.min(this.state.width - 1, this.state.cursorX + dx));
    this.state.cursorY = Math.max(0, Math.min(this.state.height - 1, this.state.cursorY + dy));

    // Update selection if in select mode
    if (this.state.currentTool === 'select' && this.state.selecting) {
      updateSelection(this.state);
    }

    this.refresh();
  }

  private toggleGuides(): void {
    const guides: ('none' | '80x25' | '80x40' | '44x22' | 'grid')[] = ['none', '80x25', '80x40', '44x22', 'grid'];
    const currentIndex = guides.indexOf(this.state.showGuide);
    const nextIndex = (currentIndex + 1) % guides.length;
    this.state.showGuide = guides[nextIndex];

    this.showStatusMessage(`Guides: ${this.state.showGuide}`);
    this.refresh();
  }

  private toggleIceColors(): void {
    this.state.iceColorsEnabled = !this.state.iceColorsEnabled;
    this.showStatusMessage(`iCE Colors: ${this.state.iceColorsEnabled ? 'ON' : 'OFF'}`);
    this.refresh();
  }

  private async quit(): Promise<void> {
    if (this.state.modified) {
      const modal = new ConfirmDialog(
        this.ui,
        'Quit',
        'File has unsaved changes. Quit anyway?'
      );

      if (!(await modal.show())) {
        this.refresh();
        return;
      }
    }

    this.running = false;
    this.ctx.close();
  }
}

// =============================================================================
// DOOR CONNECTION HANDLER
// =============================================================================

// Store active editors by socket ID to support concurrent sessions
const activeEditors = new Map<string, ANSIEditor>();

door.onStart(async (ctx: DoorContext) => {
  console.log(`[ANSI Editor] User ${ctx.user.username} connected`);

  const editor = new ANSIEditor(ctx);
  activeEditors.set(ctx.socket.id, editor);
  
  // Initialize editor (non-blocking)
  await editor.init();
});

door.onInput(async (ctx: DoorContext, key: KeyPress) => {
  const editor = activeEditors.get(ctx.socket.id);
  if (editor) {
    editor.handleInput(key);
  }
});

door.onClose(async (ctx: DoorContext) => {
  console.log(`[ANSI Editor] User ${ctx.user.username} disconnected`);
  activeEditors.delete(ctx.socket.id);
});

// =============================================================================
// EXPORT
// =============================================================================

export default door;

// Provide runDoor entrypoint expected by the TS door harness
export async function runDoor(session: any): Promise<void> {
  await door.execute(session);
}
