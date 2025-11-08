/**
 * ANSI Screen Editor Door
 * A full-featured ANSI/ASCII editor for creating BBS screen files
 *
 * Features:
 * - Draw with ANSI colors (0-7 foreground/background)
 * - Line drawing tools
 * - Text entry mode
 * - Load existing screen files
 * - Save to BBS Screens/ directory
 * - Canvas: 80x24 (standard BBS dimensions)
 */

import { Socket } from 'socket.io';

// Import types
import {
  DoorSession,
  Cell,
  Tool,
  BrushMode,
  OperationMode,
  GuideType,
  HIDE_CURSOR,
  SHOW_CURSOR,
  CLEAR_SCREEN
} from './types';

// Import modals
import {
  ANSIEditor as ANSIEditorInterface,
  ToolSelectorModal,
  ColorPickerModal,
  FileDialogModal,
  GalleryBrowserModal,
  RecentFilesModal
} from './modals';

// Import canvas operations
import {
  EditorContext,
  saveUndoState,
  flushUndoChunk,
  undo,
  redo,
  startSelection,
  updateSelection,
  getSelectionBounds,
  copySelection,
  cutSelection,
  eraseSelection,
  pasteSelection,
  importFileAsSelection,
  exportSelectionToFile,
  clearSelection,
  fillSelection,
  rotateSelection,
  flipSelectionX,
  flipSelectionY,
  centerSelection,
  moveSelection,
  cycleOperationMode,
  pasteWithMode,
  cycleFgUp,
  cycleFgDown,
  cycleBgUp,
  cycleBgDown,
  leftJustifyLine,
  rightJustifyLine,
  centerLine,
  eraseLine,
  eraseToStartOfLine,
  eraseToEndOfLine,
  insertRow,
  deleteRow,
  insertColumn,
  deleteColumn,
  eraseColumn,
  eraseToStartOfColumn,
  eraseToEndOfColumn,
  scrollCanvasUp,
  scrollCanvasDown,
  scrollCanvasLeft,
  scrollCanvasRight
} from './canvas';

// Import drawing functions
import {
  DrawingContext,
  drawWithBrush,
  applyBrushMode,
  drawCell,
  toggleMirrorMode,
  cycleGuideOverlay,
  toggleNumpadMode,
  handleNumpadDraw,
  drawLine,
  drawBox,
  drawEllipse,
  drawEllipsePoints,
  drawEllipseFilled,
  shiftCell,
  floodFill,
  pickCell
} from './drawing';

// Import file operations
import {
  FileContext,
  FileFormat,
  saveFile,
  loadFile,
  exportToAnsi,
  exportToXBin,
  exportToBin,
  exportToAsc,
  exportToDiz,
  exportToTxt,
  exportSelectionToAnsi,
  fileExists,
  getScreenFiles,
  deepCloneCanvas
} from './file-ops';

// Import display functions
import {
  DisplayContext,
  clearScreen as displayClearScreen,
  moveCursor,
  setColors,
  isGuideOverlayCell as displayIsGuideOverlayCell,
  showHelpLine,
  showStatusBar,
  refresh,
  showHelpScreen
} from './display';

class ANSIEditor implements ANSIEditorInterface {
  private socket: Socket;
  private user: any;
  private canvas: Cell[][] = [];
  private width = 80;
  private height = 24;

  // Cursor state
  private cursorX = 0;
  private cursorY = 0;

  // Viewport state (for canvases larger than 80x24)
  private viewportX = 0;  // Top-left X of viewport
  private viewportY = 0;  // Top-left Y of viewport
  private viewportWidth = 80;
  private viewportHeight = 22;  // 24 - 2 for help/status lines

  // Drawing state
  private currentFg = 7;  // White
  private currentBg = 0;  // Black
  private currentChar = ' ';
  private currentTool: Tool = 'draw';
  private iceColorsEnabled = false;  // iCE colors mode (bright backgrounds)
  private currentFKeySet: 'normal' | 'shift' = 'normal';  // Current F-key set

  // Brush state
  private brushSize = 1;  // 1-9
  private brushMode: BrushMode = 'half-block';
  private lastDrawnCells: Set<string> = new Set();  // Track cells drawn in current stroke for chunked undo
  private dragging = false;  // Track if we're currently dragging
  private dragUndoSaved = false;  // Track if we saved undo state for current drag
  private straightLineMode = false;  // Tab-hold for straight lines (horizontal/vertical only)
  private straightLineStart: { x: number; y: number } | null = null;  // Starting point for straight line constraint

  // Tool state
  private lineStart: { x: number; y: number } | null = null;
  private ellipseStart: { x: number; y: number } | null = null;
  private textMode = false;
  private textBuffer = '';

  // File state
  private filename: string | null = null;
  private modified = false;
  private lastSavedCanvas: Cell[][] | null = null;  // For revert functionality
  private autoSaveInterval: NodeJS.Timeout | null = null;
  private autoSaveEnabled = true;
  private autoSaveIntervalMs = 5 * 60 * 1000;  // 5 minutes

  // Selection state
  private selecting = false;
  private selectionStart: { x: number; y: number } | null = null;
  private selectionEnd: { x: number; y: number } | null = null;
  private clipboard: Cell[][] = [];
  private operationMode: OperationMode = 'normal';

  // Insert mode
  private insertMode = true;

  // Undo stack (simple - stores full canvas snapshots)
  private undoStack: Cell[][][] = [];
  private redoStack: Cell[][][] = [];
  private maxUndoLevels = 50;

  // Chunked undo system (Phase 6.2)
  private lastUndoTime = 0;
  private undoChunkTimeout = 1000;  // 1 second timeout for grouping operations
  private pendingUndoChunk = false;

  // Mirror mode (Phase 9.1)
  private mirrorModeEnabled = false;  // Horizontal symmetry drawing

  // Guides & Overlays (Phase 9.3)
  private guideOverlayEnabled = false;
  private guideType: GuideType = 'none';
  private gridSpacing = 4;  // For custom grid overlay

  // Character sets (F-key macros)
  private currentCharSet = 0;  // 0-19 (Alt+0-9, Alt+Shift+0-9)
  private charSets: string[][] = [];  // 20 sets, 12 chars each

  // Numpad drawing mode (Phase 9.2)
  private numpadModeEnabled = false;  // Keyboard keys act as numpad directions

  // Door session reference
  private doorSession: DoorSession;

  // BBS-specific features (Phase 10 - sysop/cosysop only)
  private static recentFiles: string[] = [];  // Last 10 edited files (shared across sessions)
  private static lockedFiles: Map<string, { username: string; nodeId: number }> = new Map();  // File locks
  private static readonly MAX_RECENT_FILES = 10;

  constructor(session: DoorSession) {
    console.log('[ANSI Editor constructor] Initializing editor');
    this.socket = session.socket;
    this.user = session.user;
    this.doorSession = session;
    this.initCanvas();
    this.initCharacterSets();
    console.log('[ANSI Editor constructor] Editor initialized');
  }

  private initCanvas(): void {
    // Initialize with blank cells
    for (let y = 0; y < this.height; y++) {
      this.canvas[y] = [];
      for (let x = 0; x < this.width; x++) {
        this.canvas[y][x] = { char: ' ', fg: 7, bg: 0 };
      }
    }
  }

  /**
   * Initialize default character sets (20 sets, 12 chars each)
   */
  private initCharacterSets(): void {
    // Default character sets - common ANSI/ASCII art characters
    const defaultSets = [
      // Set 0: Box drawing (single line)
      ['─', '│', '┌', '┐', '└', '┘', '├', '┤', '┬', '┴', '┼', '═'],
      // Set 1: Box drawing (double line)
      ['═', '║', '╔', '╗', '╚', '╝', '╠', '╣', '╦', '╩', '╬', '─'],
      // Set 2: Block elements
      ['█', '▓', '▒', '░', '▄', '▀', '■', '□', '▪', '▫', '●', '○'],
      // Set 3: Arrows
      ['↑', '↓', '←', '→', '↔', '↕', '▲', '▼', '◄', '►', '◆', '◇'],
      // Set 4: Common symbols
      ['★', '☆', '♥', '♦', '♣', '♠', '•', '◘', '◙', '♂', '♀', '♪'],
      // Set 5: Math/technical
      ['±', '÷', '×', '∙', '°', '²', '³', '¹', '¼', '½', '¾', '‰'],
      // Set 6: Currency
      ['$', '¢', '£', '¥', '€', '₹', '₽', '₩', '₪', '฿', '₫', '₵'],
      // Set 7: Letters (Greek)
      ['α', 'β', 'γ', 'δ', 'ε', 'θ', 'λ', 'μ', 'π', 'σ', 'φ', 'ω'],
      // Set 8: Brackets/quotes
      ['(', ')', '[', ']', '{', '}', '<', '>', '"', '\'', '`', '~'],
      // Set 9: Punctuation
      ['!', '?', '.', ',', ':', ';', '-', '_', '/', '\\', '|', '+'],
      // Set 10-19: Empty sets for user customization
      ...Array(10).fill(null).map(() => Array(12).fill(' '))
    ];

    this.charSets = defaultSets;
  }

  emit(data: string): void {
    this.socket.emit('ansi-output', data);
  }

  // Context builder methods
  private getEditorContext(): EditorContext {
    return {
      canvas: this.canvas,
      width: this.width,
      height: this.height,
      cursorX: this.cursorX,
      cursorY: this.cursorY,
      currentFg: this.currentFg,
      currentBg: this.currentBg,
      currentChar: this.currentChar,
      selecting: this.selecting,
      selectionStart: this.selectionStart,
      selectionEnd: this.selectionEnd,
      clipboard: this.clipboard,
      undoStack: this.undoStack,
      redoStack: this.redoStack,
      maxUndoLevels: this.maxUndoLevels,
      lastUndoTime: this.lastUndoTime,
      undoChunkTimeout: this.undoChunkTimeout,
      pendingUndoChunk: this.pendingUndoChunk,
      operationMode: this.operationMode,
      insertMode: this.insertMode,
      emit: this.emit.bind(this),
      refresh: () => this.refreshDisplay(),
      getFileContext: () => this.getFileContext()
    };
  }

  private getDrawingContext(): DrawingContext {
    return {
      canvas: this.canvas,
      width: this.width,
      height: this.height,
      cursorX: this.cursorX,
      cursorY: this.cursorY,
      currentFg: this.currentFg,
      currentBg: this.currentBg,
      currentChar: this.currentChar,
      brushSize: this.brushSize,
      brushMode: this.brushMode,
      currentTool: this.currentTool,
      mirrorModeEnabled: this.mirrorModeEnabled,
      guideType: this.guideType,
      gridSpacing: this.gridSpacing,
      numpadModeEnabled: this.numpadModeEnabled,
      viewportWidth: this.viewportWidth,
      emit: this.emit.bind(this),
      saveUndoState: (chunk?: boolean) => saveUndoState(this.getEditorContext(), chunk),
      refresh: () => this.refreshDisplay()
    };
  }

  private getFileContext(): FileContext {
    return {
      canvas: this.canvas,
      width: this.width,
      height: this.height,
      filename: this.filename,
      modified: this.modified,
      doorSession: this.doorSession,
      emit: this.emit.bind(this),
      refresh: () => this.refreshDisplay(),
      saveUndoState: (chunk?: boolean) => saveUndoState(this.getEditorContext(), chunk)
    };
  }

  private getDisplayContext(): DisplayContext {
    return {
      canvas: this.canvas,
      width: this.width,
      height: this.height,
      viewportX: this.viewportX,
      viewportY: this.viewportY,
      viewportWidth: this.viewportWidth,
      viewportHeight: this.viewportHeight,
      cursorX: this.cursorX,
      cursorY: this.cursorY,
      currentFg: this.currentFg,
      currentBg: this.currentBg,
      currentChar: this.currentChar,
      currentTool: this.currentTool,
      brushSize: this.brushSize,
      brushMode: this.brushMode,
      filename: this.filename,
      modified: this.modified,
      selecting: this.selecting,
      selectionStart: this.selectionStart,
      selectionEnd: this.selectionEnd,
      operationMode: this.operationMode,
      mirrorModeEnabled: this.mirrorModeEnabled,
      guideOverlayEnabled: this.guideOverlayEnabled,
      guideType: this.guideType,
      gridSpacing: this.gridSpacing,
      numpadModeEnabled: this.numpadModeEnabled,
      iceColorsEnabled: this.iceColorsEnabled,
      currentFKeySet: this.currentFKeySet,
      emit: this.emit.bind(this),
      doorSession: this.doorSession,  // CRITICAL: Help modal needs this for input handler
      refresh: this.refreshDisplay.bind(this)
    };
  }

  private refreshDisplay(): void {
    refresh(this.getDisplayContext());
  }

  private moveCursorRel(dx: number, dy: number): void {
    this.cursorX = Math.max(0, Math.min(this.width - 1, this.cursorX + dx));
    this.cursorY = Math.max(0, Math.min(this.height - 1, this.cursorY + dy));
    this.refreshDisplay();
  }

  /**
   * Start autosave timer
   */
  private startAutoSave(): void {
    if (!this.autoSaveEnabled) return;
    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval);
    }
    this.autoSaveInterval = setInterval(() => {
      if (this.modified && this.filename) {
        console.log('[ANSI Editor] Auto-saving...');
        const ctx = this.getFileContext();
        saveFile(ctx, this.filename);
        this.modified = false;
        this.refreshDisplay();
      }
    }, this.autoSaveIntervalMs);
  }

  /**
   * Stop autosave timer
   */
  private stopAutoSave(): void {
    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval);
      this.autoSaveInterval = null;
    }
  }

  /**
   * Show tool selector modal and handle tool selection
   */
  private async selectTool(): Promise<void> {
    const modal = new ToolSelectorModal(this, this.currentTool);
    this.emit(modal.render());

    return new Promise((resolve) => {
      // Save original handler and replace with modal handler
      const originalHandler = this.doorSession.bbsSession?.doorInputHandler || null;

      const handler = (key: string) => {
        if (key === '\x1b') {  // ESC
          // Restore original handler
          if (this.doorSession.bbsSession) {
            this.doorSession.bbsSession.doorInputHandler = originalHandler;
          }
          this.refreshDisplay();
          resolve();
        } else if (key === '\r') {  // Enter
          this.currentTool = modal.getSelectedValue() as Tool;
          // Restore original handler
          if (this.doorSession.bbsSession) {
            this.doorSession.bbsSession.doorInputHandler = originalHandler;
          }
          this.refreshDisplay();
          resolve();
        } else if (key === '\x1b[A') {  // Up arrow
          modal.moveUp();
          this.emit(modal.render());
        } else if (key === '\x1b[B') {  // Down arrow
          modal.moveDown();
          this.emit(modal.render());
        }
      };

      // Register modal handler
      if (this.doorSession.bbsSession) {
        this.doorSession.bbsSession.doorInputHandler = handler;
      }
    });
  }

  /**
   * Show color picker modal and handle color selection
   */
  private async selectColor(isBg: boolean): Promise<void> {
    const modal = new ColorPickerModal(this, isBg ? this.currentBg : this.currentFg, isBg);
    this.emit(modal.render());

    return new Promise((resolve) => {
      // Save original handler and replace with modal handler
      const originalHandler = this.doorSession.bbsSession?.doorInputHandler || null;

      const handler = (key: string) => {
        if (key === '\x1b') {  // ESC
          // Restore original handler
          if (this.doorSession.bbsSession) {
            this.doorSession.bbsSession.doorInputHandler = originalHandler;
          }
          this.refreshDisplay();
          resolve();
        } else if (key === '\r') {  // Enter
          const color = parseInt(modal.getSelectedValue());
          if (isBg) {
            this.currentBg = color;
          } else {
            this.currentFg = color;
          }
          // Restore original handler
          if (this.doorSession.bbsSession) {
            this.doorSession.bbsSession.doorInputHandler = originalHandler;
          }
          this.refreshDisplay();
          resolve();
        } else if (key === '\x1b[A') {  // Up arrow
          modal.moveUp();
          this.emit(modal.render());
        } else if (key === '\x1b[B') {  // Down arrow
          modal.moveDown();
          this.emit(modal.render());
        }
      };

      // Register modal handler
      if (this.doorSession.bbsSession) {
        this.doorSession.bbsSession.doorInputHandler = handler;
      }
    });
  }

  /**
   * Show file dialog (load/save) and handle file selection
   */
  private async showFileDialog(mode: 'load' | 'save'): Promise<void> {
    const ctx = this.getFileContext();
    const files = getScreenFiles(ctx);
    const modal = new FileDialogModal(this, mode, files, this.filename || '');
    this.emit(modal.render());

    return new Promise((resolve) => {
      // Save original handler and replace with modal handler
      const originalHandler = this.doorSession.bbsSession?.doorInputHandler || null;
      let inputBuffer = this.filename || '';

      const handler = (key: string) => {
        if (key === '\x1b') {  // ESC
          // Restore original handler
          if (this.doorSession.bbsSession) {
            this.doorSession.bbsSession.doorInputHandler = originalHandler;
          }
          this.refreshDisplay();
          resolve();
        } else if (key === '\r') {  // Enter
          const selectedFile = modal.getSelectedValue();
          if (selectedFile) {
            if (mode === 'load') {
              loadFile(ctx, selectedFile);
              this.filename = selectedFile;
              this.modified = false;
              // Update local state from context
              this.canvas = ctx.canvas;
              this.width = ctx.width;
              this.height = ctx.height;
            } else {
              saveFile(ctx, selectedFile);
              this.filename = selectedFile;
              this.modified = false;
              // Update recent files
              ANSIEditor.addRecentFile(selectedFile);
            }
          }
          // Restore original handler
          if (this.doorSession.bbsSession) {
            this.doorSession.bbsSession.doorInputHandler = originalHandler;
          }
          this.refreshDisplay();
          resolve();
        } else if (key === '\x1b[A') {  // Up arrow
          modal.moveUp();
          this.emit(modal.render());
        } else if (key === '\x1b[B') {  // Down arrow
          modal.moveDown();
          this.emit(modal.render());
        } else if (key === '\x7f' || key === '\x08') {  // Backspace
          if (inputBuffer.length > 0) {
            inputBuffer = inputBuffer.slice(0, -1);
            modal.updateInput(inputBuffer);
            this.emit(modal.render());
          }
        } else if (key.length === 1 && key >= ' ' && key <= '~') {  // Printable ASCII
          inputBuffer += key;
          modal.updateInput(inputBuffer);
          this.emit(modal.render());
        }
      };

      // Register modal handler
      if (this.doorSession.bbsSession) {
        this.doorSession.bbsSession.doorInputHandler = handler;
      }
    });
  }

  /**
   * Show gallery browser modal (sysop/cosysop only)
   */
  private async showGalleryBrowser(): Promise<void> {
    const ctx = this.getFileContext();
    const files = getScreenFiles(ctx);
    const modal = new GalleryBrowserModal(this, files);
    this.emit(modal.render());

    return new Promise((resolve) => {
      // Save original handler and replace with modal handler
      const originalHandler = this.doorSession.bbsSession?.doorInputHandler || null;

      const handler = (key: string) => {
        if (key === '\x1b' || key === 'q' || key === 'Q') {  // ESC or Q
          // Restore original handler
          if (this.doorSession.bbsSession) {
            this.doorSession.bbsSession.doorInputHandler = originalHandler;
          }
          this.refreshDisplay();
          resolve();
        } else if (key === '\r') {  // Enter - load selected file
          const selectedFile = modal.getSelectedValue();
          if (selectedFile) {
            loadFile(ctx, selectedFile);
            this.filename = selectedFile;
            this.modified = false;
            // Update local state from context
            this.canvas = ctx.canvas;
            this.width = ctx.width;
            this.height = ctx.height;
          }
          // Restore original handler
          if (this.doorSession.bbsSession) {
            this.doorSession.bbsSession.doorInputHandler = originalHandler;
          }
          this.refreshDisplay();
          resolve();
        } else if (key === '\x1b[A' || key === 'k' || key === 'K') {  // Up arrow or K
          modal.moveUp();
          this.emit(modal.render());
        } else if (key === '\x1b[B' || key === 'j' || key === 'J') {  // Down arrow or J
          modal.moveDown();
          this.emit(modal.render());
        } else if (key === '\x1b[D' || key === 'h' || key === 'H') {  // Left arrow or H
          modal.moveLeft();
          this.emit(modal.render());
        } else if (key === '\x1b[C' || key === 'l' || key === 'L') {  // Right arrow or L
          modal.moveRight();
          this.emit(modal.render());
        }
      };

      // Register modal handler
      if (this.doorSession.bbsSession) {
        this.doorSession.bbsSession.doorInputHandler = handler;
      }
    });
  }

  /**
   * Show recent files modal (sysop/cosysop only)
   */
  private async showRecentFiles(): Promise<void> {
    const modal = new RecentFilesModal(this, ANSIEditor.recentFiles);
    this.emit(modal.render());

    return new Promise((resolve) => {
      // Save original handler and replace with modal handler
      const originalHandler = this.doorSession.bbsSession?.doorInputHandler || null;

      const handler = (key: string) => {
        if (key === '\x1b') {  // ESC
          // Restore original handler
          if (this.doorSession.bbsSession) {
            this.doorSession.bbsSession.doorInputHandler = originalHandler;
          }
          this.refreshDisplay();
          resolve();
        } else if (key === '\r') {  // Enter
          const selectedFile = modal.getSelectedValue();
          if (selectedFile) {
            const ctx = this.getFileContext();
            loadFile(ctx, selectedFile);
            this.filename = selectedFile;
            this.modified = false;
            // Update local state from context
            this.canvas = ctx.canvas;
            this.width = ctx.width;
            this.height = ctx.height;
          }
          // Restore original handler
          if (this.doorSession.bbsSession) {
            this.doorSession.bbsSession.doorInputHandler = originalHandler;
          }
          this.refreshDisplay();
          resolve();
        } else if (key === '\x1b[A') {  // Up arrow
          modal.moveUp();
          this.emit(modal.render());
        } else if (key === '\x1b[B') {  // Down arrow
          modal.moveDown();
          this.emit(modal.render());
        }
      };

      // Register modal handler
      if (this.doorSession.bbsSession) {
        this.doorSession.bbsSession.doorInputHandler = handler;
      }
    });
  }

  /**
   * Add file to recent files list
   */
  private static addRecentFile(filename: string): void {
    // Remove if already in list
    const index = ANSIEditor.recentFiles.indexOf(filename);
    if (index !== -1) {
      ANSIEditor.recentFiles.splice(index, 1);
    }

    // Add to front
    ANSIEditor.recentFiles.unshift(filename);

    // Keep only MAX_RECENT_FILES
    if (ANSIEditor.recentFiles.length > ANSIEditor.MAX_RECENT_FILES) {
      ANSIEditor.recentFiles = ANSIEditor.recentFiles.slice(0, ANSIEditor.MAX_RECENT_FILES);
    }
  }

  /**
   * Check if a file is locked by another user
   */
  private static isFileLocked(filename: string, username: string, nodeId: number): boolean {
    const lock = ANSIEditor.lockedFiles.get(filename);
    if (!lock) return false;
    return lock.username !== username || lock.nodeId !== nodeId;
  }

  /**
   * Lock a file for editing
   */
  private lockFile(): void {
    if (!this.filename) return;
    ANSIEditor.lockedFiles.set(this.filename, {
      username: this.user.username,
      nodeId: this.doorSession.bbsSession?.nodeId || 0
    });
  }

  /**
   * Unlock a file
   */
  private unlockFile(): void {
    if (!this.filename) return;
    ANSIEditor.lockedFiles.delete(this.filename);
  }

  async run(): Promise<void> {
    console.log('[ANSI Editor run] Starting editor main loop');
    this.emit(HIDE_CURSOR);
    this.emit(CLEAR_SCREEN);

    // Initialize canvas
    const ctx = this.getDisplayContext();
    saveUndoState(this.getEditorContext());
    this.startAutoSave();
    this.refreshDisplay();

    // Create promise that will resolve when user exits
    await new Promise<void>((resolve) => {
      // Main input handler - register in session for socket-handlers to call
      const inputHandler = async (key: string) => {
      console.log('[ANSI Editor input] ===== MAIN EDITOR INPUT =====');
      console.log('[ANSI Editor input] Received key:', JSON.stringify(key));
      console.log('[ANSI Editor input] Current handler type:', typeof this.doorSession.bbsSession?.doorInputHandler);
      console.log('[ANSI Editor input] Is this handler?', this.doorSession.bbsSession?.doorInputHandler === inputHandler);

      // Handle mouse events (sent as JSON from socket-handlers)
      if (key.startsWith('{')) {
        try {
          const mouseData = JSON.parse(key);
          if (mouseData.type === 'mouse-hover') {
            // Move cursor to follow mouse (coordinates are 0-indexed)
            this.cursorX = Math.max(0, Math.min(this.width - 1, mouseData.x));
            this.cursorY = Math.max(0, Math.min(this.height - 1, mouseData.y));
            this.refreshDisplay();
            return;
          } else if (mouseData.type === 'mouse-click') {
            // Handle click based on tool
            this.cursorX = Math.max(0, Math.min(this.width - 1, mouseData.x));
            this.cursorY = Math.max(0, Math.min(this.height - 1, mouseData.y));
            if (this.currentTool === 'draw') {
              saveUndoState(this.getEditorContext(), true);
              drawWithBrush(this.getDrawingContext(), this.cursorX, this.cursorY);
              this.modified = true;
            } else if (this.currentTool === 'pick') {
              pickCell(this.getDrawingContext(), this.cursorX, this.cursorY);
              const drawCtx = this.getDrawingContext();
              this.currentFg = drawCtx.currentFg;
              this.currentBg = drawCtx.currentBg;
              this.currentChar = drawCtx.currentChar;
            }
            this.refreshDisplay();
            return;
          } else if (mouseData.type === 'mouse-drag') {
            // Continuous drawing while dragging
            this.cursorX = Math.max(0, Math.min(this.width - 1, mouseData.x));
            this.cursorY = Math.max(0, Math.min(this.height - 1, mouseData.y));
            if (this.currentTool === 'draw') {
              saveUndoState(this.getEditorContext(), true);
              drawWithBrush(this.getDrawingContext(), this.cursorX, this.cursorY);
              this.modified = true;
              this.refreshDisplay();
            }
            return;
          }
        } catch (e) {
          // Not JSON, continue to regular key handling
        }
      }

      // Handle ESC (exit)
      if (key === '\x1b') {
        console.log('[ANSI Editor] ESC pressed, exiting');
        this.stopAutoSave();
        this.unlockFile();
        this.emit(SHOW_CURSOR);
        this.emit(CLEAR_SCREEN);

        // Clean up the input handler
        if (this.doorSession.bbsSession) {
          delete this.doorSession.bbsSession.doorInputHandler;
          console.log('[ANSI Editor] Cleaned up doorInputHandler');
          console.log('[ANSI Editor] Returning to BBS...');
          this.doorSession.bbsSession.returnFromDoor();
        } else {
          console.error('[ANSI Editor] ERROR: No bbsSession!');
        }
        resolve(); // Exit the promise to end the door session
        return;
      }

      // Handle F1 (help)
      if (key === '\x1bOP' || key === '\x1b[11~') {
        console.log('[ANSI Editor input] F1 pressed, opening help screen');
        console.log('[ANSI Editor input] Before help - handler is:', this.doorSession.bbsSession?.doorInputHandler === inputHandler);
        await showHelpScreen(this.getDisplayContext());
        console.log('[ANSI Editor input] After help - handler is:', this.doorSession.bbsSession?.doorInputHandler === inputHandler);
        console.log('[ANSI Editor input] After help - handler type:', typeof this.doorSession.bbsSession?.doorInputHandler);
        return;
      }

      // Handle F2 (save)
      if (key === '\x1bOQ' || key === '\x1b[12~') {
        if (this.filename) {
          const ctx = this.getFileContext();
          saveFile(ctx, this.filename);
          this.modified = false;
          this.refreshDisplay();
        } else {
          await this.showFileDialog('save');
        }
        return;
      }

      // Handle F3 (load)
      if (key === '\x1bOR' || key === '\x1b[13~') {
        await this.showFileDialog('load');
        return;
      }

      // Handle F4 (new)
      if (key === '\x1bOS' || key === '\x1b[14~') {
        saveUndoState(this.getEditorContext());
        this.canvas = [];
        this.initCanvas();
        this.filename = null;
        this.modified = false;
        this.cursorX = 0;
        this.cursorY = 0;
        this.refreshDisplay();
        return;
      }

      // Handle F5 (tool selector)
      if (key === '\x1b[15~') {
        await this.selectTool();
        return;
      }

      // Handle F6 (foreground color)
      if (key === '\x1b[17~') {
        await this.selectColor(false);
        return;
      }

      // Handle F7 (background color)
      if (key === '\x1b[18~') {
        await this.selectColor(true);
        return;
      }

      // Handle F8 (cycle foreground)
      if (key === '\x1b[19~') {
        cycleFgUp(this.getEditorContext());
        this.currentFg = this.getEditorContext().currentFg;
        this.refreshDisplay();
        return;
      }

      // Handle F9 (cycle background)
      if (key === '\x1b[20~') {
        cycleBgUp(this.getEditorContext());
        this.currentBg = this.getEditorContext().currentBg;
        this.refreshDisplay();
        return;
      }

      // Handle F10 (recent files - sysop/cosysop only)
      if (key === '\x1b[21~') {
        if (this.user.accessLevel >= 250) {
          await this.showRecentFiles();
        }
        return;
      }

      // Handle Shift+F10 (gallery browser - sysop/cosysop only)
      if (key === '\x1b[21;2~') {
        if (this.user.accessLevel >= 250) {
          await this.showGalleryBrowser();
        }
        return;
      }

      // Handle tool selection hotkeys
      if (key === 'K' || key === 'k') {  // K - Draw mode
        this.currentTool = 'draw';
        this.lineStart = null;
        this.ellipseStart = null;
        this.refreshDisplay();
        return;
      }
      if (key === 'I' || key === 'i') {  // I - Line mode
        this.currentTool = 'line';
        this.lineStart = null;
        this.ellipseStart = null;
        this.refreshDisplay();
        return;
      }
      if (key === 'B' || key === 'b') {  // B - Box mode
        this.currentTool = 'box';
        this.lineStart = null;
        this.ellipseStart = null;
        this.refreshDisplay();
        return;
      }
      if (key === 'E' || key === 'e') {  // E - Ellipse mode
        this.currentTool = 'ellipse';
        this.lineStart = null;
        this.ellipseStart = null;
        this.refreshDisplay();
        return;
      }
      if (key === 'T' || key === 't') {  // T - Text mode
        this.currentTool = 'text';
        this.lineStart = null;
        this.ellipseStart = null;
        this.refreshDisplay();
        return;
      }
      if (key === 'P' || key === 'p') {  // P - Fill mode
        this.currentTool = 'fill';
        this.lineStart = null;
        this.ellipseStart = null;
        this.refreshDisplay();
        return;
      }
      if (key === 'U' || key === 'u') {  // U - Pick mode
        this.currentTool = 'pick';
        this.lineStart = null;
        this.ellipseStart = null;
        this.refreshDisplay();
        return;
      }
      if (key === 'V' || key === 'v') {  // V - Shifter mode
        this.currentTool = 'shift';
        this.lineStart = null;
        this.ellipseStart = null;
        this.refreshDisplay();
        return;
      }

      // Handle arrow keys (cursor movement or shift tool)
      if (key === '\x1b[A') {  // Up
        console.log('[ANSI Editor input] Up arrow in main editor');
        if (this.currentTool === 'shift') {
          // Shift tool: move content without redrawing
          this.moveCursorRel(0, -1);
        } else {
          this.moveCursorRel(0, -1);
        }
        return;
      }
      if (key === '\x1b[B') {  // Down
        console.log('[ANSI Editor input] Down arrow in main editor');
        if (this.currentTool === 'shift') {
          this.moveCursorRel(0, 1);
        } else {
          this.moveCursorRel(0, 1);
        }
        return;
      }
      if (key === '\x1b[C') {  // Right
        console.log('[ANSI Editor input] Right arrow in main editor');
        if (this.currentTool === 'shift') {
          saveUndoState(this.getEditorContext());
          shiftCell(this.getDrawingContext(), 'right', false);
          this.modified = true;
          this.refreshDisplay();
        } else {
          this.moveCursorRel(1, 0);
        }
        return;
      }
      if (key === '\x1b[D') {  // Left
        if (this.currentTool === 'shift') {
          saveUndoState(this.getEditorContext());
          shiftCell(this.getDrawingContext(), 'left', false);
          this.modified = true;
          this.refreshDisplay();
        } else {
          this.moveCursorRel(-1, 0);
        }
        return;
      }

      // Handle Ctrl+Z (undo)
      if (key === '\x1a') {
        undo(this.getEditorContext());
        // Update local state from context
        const edCtx = this.getEditorContext();
        this.canvas = edCtx.canvas;
        this.undoStack = edCtx.undoStack;
        this.redoStack = edCtx.redoStack;
        this.refreshDisplay();
        return;
      }

      // Handle Ctrl+Y (redo)
      if (key === '\x19') {
        redo(this.getEditorContext());
        // Update local state from context
        const edCtx = this.getEditorContext();
        this.canvas = edCtx.canvas;
        this.undoStack = edCtx.undoStack;
        this.redoStack = edCtx.redoStack;
        this.refreshDisplay();
        return;
      }

      // Handle Ctrl+C (copy)
      if (key === '\x03') {
        copySelection(this.getEditorContext());
        this.clipboard = this.getEditorContext().clipboard;
        this.refreshDisplay();
        return;
      }

      // Handle Ctrl+X (cut)
      if (key === '\x18') {
        cutSelection(this.getEditorContext());
        const edCtx = this.getEditorContext();
        this.canvas = edCtx.canvas;
        this.clipboard = edCtx.clipboard;
        this.refreshDisplay();
        return;
      }

      // Handle Ctrl+V (paste)
      if (key === '\x16') {
        pasteSelection(this.getEditorContext());
        this.canvas = this.getEditorContext().canvas;
        this.modified = true;
        this.refreshDisplay();
        return;
      }

      // Handle Space (draw/toggle)
      if (key === ' ') {
        if (this.currentTool === 'draw') {
          saveUndoState(this.getEditorContext(), true);
          drawWithBrush(this.getDrawingContext(), this.cursorX, this.cursorY);
          this.modified = true;
          this.refreshDisplay();
        }
        return;
      }

      // Handle Enter (for line/box tools)
      if (key === '\r') {
        if (this.currentTool === 'line' && this.lineStart) {
          saveUndoState(this.getEditorContext());
          drawLine(this.getDrawingContext(), this.lineStart.x, this.lineStart.y, this.cursorX, this.cursorY);
          this.lineStart = null;
          this.modified = true;
          this.refreshDisplay();
        } else if (this.currentTool === 'box' && this.lineStart) {
          saveUndoState(this.getEditorContext());
          drawBox(this.getDrawingContext(), this.lineStart.x, this.lineStart.y, this.cursorX, this.cursorY);
          this.lineStart = null;
          this.modified = true;
          this.refreshDisplay();
        } else if (this.currentTool === 'ellipse' && this.ellipseStart) {
          saveUndoState(this.getEditorContext());
          const rx = Math.abs(this.cursorX - this.ellipseStart.x);
          const ry = Math.abs(this.cursorY - this.ellipseStart.y);
          drawEllipse(this.getDrawingContext(), this.ellipseStart.x, this.ellipseStart.y, rx, ry);
          this.ellipseStart = null;
          this.modified = true;
          this.refreshDisplay();
        } else if (this.currentTool === 'ellipse-fill' && this.ellipseStart) {
          saveUndoState(this.getEditorContext());
          const rx = Math.abs(this.cursorX - this.ellipseStart.x);
          const ry = Math.abs(this.cursorY - this.ellipseStart.y);
          drawEllipseFilled(this.getDrawingContext(), this.ellipseStart.x, this.ellipseStart.y, rx, ry);
          this.ellipseStart = null;
          this.modified = true;
          this.refreshDisplay();
        } else if (this.currentTool === 'line') {
          this.lineStart = { x: this.cursorX, y: this.cursorY };
        } else if (this.currentTool === 'box') {
          this.lineStart = { x: this.cursorX, y: this.cursorY };
        } else if (this.currentTool === 'ellipse' || this.currentTool === 'ellipse-fill') {
          this.ellipseStart = { x: this.cursorX, y: this.cursorY };
        }
        return;
      }

      // Handle text mode
      if (this.currentTool === 'text' && key.length === 1 && key >= ' ' && key <= '~') {
        saveUndoState(this.getEditorContext(), true);
        this.canvas[this.cursorY][this.cursorX] = {
          char: key,
          fg: this.currentFg,
          bg: this.currentBg
        };
        this.cursorX++;
        if (this.cursorX >= this.width) {
          this.cursorX = 0;
          this.cursorY = Math.min(this.height - 1, this.cursorY + 1);
        }
        this.modified = true;
        this.refreshDisplay();
        return;
      }

      // Handle fill tool
      if (this.currentTool === 'fill' && key === '\r') {
        saveUndoState(this.getEditorContext());
        floodFill(this.getDrawingContext(), this.cursorX, this.cursorY);
        this.modified = true;
        this.refreshDisplay();
        return;
      }

      // Handle pick tool
      if (this.currentTool === 'pick' && key === '\r') {
        pickCell(this.getDrawingContext(), this.cursorX, this.cursorY);
        const drawCtx = this.getDrawingContext();
        this.currentFg = drawCtx.currentFg;
        this.currentBg = drawCtx.currentBg;
        this.currentChar = drawCtx.currentChar;
        this.refreshDisplay();
        return;
      }

      // Handle numpad mode drawing
      if (this.numpadModeEnabled && handleNumpadDraw(this.getDrawingContext(), key)) {
        this.modified = true;
        this.refreshDisplay();
        return;
      }

      // Handle brush size controls (1-9)
      if (key >= '1' && key <= '9' && this.currentTool === 'draw') {
        this.brushSize = parseInt(key);
        this.refreshDisplay();
        return;
      }

      // Handle brush mode cycling [ ]
      if (key === '[') {  // Cycle brush mode backwards
        const modes: BrushMode[] = ['half-block', 'custom', 'shading', 'colorize', 'blink', 'replace'];
        const currentIndex = modes.indexOf(this.brushMode);
        this.brushMode = modes[(currentIndex - 1 + modes.length) % modes.length];
        this.refreshDisplay();
        return;
      }
      if (key === ']') {  // Cycle brush mode forwards
        const modes: BrushMode[] = ['half-block', 'custom', 'shading', 'colorize', 'blink', 'replace'];
        const currentIndex = modes.indexOf(this.brushMode);
        this.brushMode = modes[(currentIndex + 1) % modes.length];
        this.refreshDisplay();
        return;
      }

      // Handle paste mode cycling T/O/U (when selection exists)
      if (key === 'T' || key === 't') {
        if (this.clipboard.length > 0) {
          cycleOperationMode(this.getEditorContext(), 'transparent');
          this.refreshDisplay();
          return;
        }
      }
      if (key === 'O' || key === 'o') {
        if (this.clipboard.length > 0) {
          cycleOperationMode(this.getEditorContext(), 'over');
          this.refreshDisplay();
          return;
        }
      }
      if (key === 'U' || key === 'u' && this.currentTool !== 'pick') {  // U is pick tool, only paste mode if not in pick mode
        if (this.clipboard.length > 0) {
          cycleOperationMode(this.getEditorContext(), 'under');
          this.refreshDisplay();
          return;
        }
      }

      // Handle other printable characters (if not handled above)
      if (key.length === 1 && key >= ' ' && key <= '~') {
        this.currentChar = key;
        this.refreshDisplay();
      }
      }; // End of inputHandler

      // Register the input handler in the BBS session so socket-handlers can call it
      if (this.doorSession.bbsSession) {
        this.doorSession.bbsSession.doorInputHandler = inputHandler;
        console.log('[ANSI Editor] Registered doorInputHandler in session');

        // Show help screen on startup (after handler is registered)
        showHelpScreen(this.getDisplayContext()).then(() => {
          console.log('[ANSI Editor] Help screen closed on startup');
        });
      }
    }); // End of Promise - wait until user exits
  }
}

export async function runDoor(session: DoorSession) {
  console.log('[ANSI Editor runDoor] Starting ANSI editor door');

  // Enable mouse events for ANSI editor (drawing, clicking, hovering)
  if (session.bbsSession) {
    session.bbsSession.mouseEventsEnabled = true;
    console.log('[ANSI Editor runDoor] Mouse events enabled');
    // Notify frontend to hide mouse cursor (mouse controls terminal cursor)
    session.socket.emit('mouse-mode', { enabled: true });
  }

  const editor = new ANSIEditor(session);
  console.log('[ANSI Editor runDoor] Editor created, calling run()');
  await editor.run();
  console.log('[ANSI Editor runDoor] Editor run() completed');

  // Disable mouse events when exiting
  if (session.bbsSession) {
    session.bbsSession.mouseEventsEnabled = false;
    console.log('[ANSI Editor runDoor] Mouse events disabled');
    // Notify frontend to show mouse cursor (normal BBS operation)
    session.socket.emit('mouse-mode', { enabled: false });
  }
}

export default runDoor;
