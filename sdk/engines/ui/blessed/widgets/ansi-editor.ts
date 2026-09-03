/**
 * ANSIEditor - Full-featured ANSI/ASCII art editor widget
 *
 * Features:
 * - Text and Draw modes
 * - Full drawing toolset (draw, line, box, ellipse, fill, pick, select)
 * - ANSI color picker and character picker
 * - Search and replace
 * - Undo/redo
 * - Mouse and keyboard support
 * - File save/load support
 *
 * This widget uses the core ANSI Editor library for all canvas operations
 * and drawing tools, making the core functionality reusable for other doors.
 */

import { Box } from './box';
import { Canvas } from './canvas';
import { Text } from './text';
import { List } from './list';
import { Overlay } from './overlay';
import { DocModal } from './doc-modal';
import { ConfirmModal } from './confirm-modal';
import { DropdownMenu, type DropdownMenuItem } from './dropdown-menu';
import { Button } from './button';
import { openThemeMenu } from './theme-menu';
import { activeTheme } from '../../theme/live.js';
import type { ElementOptions } from '../core/types';
import { trapModalInput } from '../utils/modal-helpers';

// Import core library for reusable ANSI editor functionality
import type { Cell, DrawingTool } from '../../ansi-editor/types';
import * as CoreCanvas from '../../ansi-editor/core/canvas';
import {
  drawTool,
  fillTool,
  pickTool,
  getToolHandler,
  undoDrawing,
  redoDrawing,
  clearUndoStack,
  paintCell,
  pasteSelection,
  snapshotUndoState,
  getSelectionBounds,
} from '../../ansi-editor/tools/drawing-tools';
import { EditorState as CoreEditorState } from '../../ansi-editor/core/editor-state';

export interface ANSIEditorOptions extends ElementOptions {
  title?: string;
  initialContent?: string;
  initialMode?: EditorMode; // Default: 'text'
  maxLines?: number;
  maxLineLength?: number;
  canvasWidth?: number;   // Draw-mode canvas width in cells. Default: 80.
  canvasHeight?: number;  // Draw-mode canvas height in cells. Default: 25.
  // Presentation-only magnification: a cell is drawn cellScaleX characters
  // wide and cellScaleY rows tall. getCoreCanvas() is unaffected, so a host
  // editing a 5x2 sprite reads back a 5x2 grid however large it is drawn.
  // Default 1/1 - existing hosts render exactly as they do today.
  cellScaleX?: number;
  cellScaleY?: number;
  // When true, a freshly-created canvas (construction, File > New) and any
  // erased cell are transparent instead of a solid black space - see
  // CoreCanvas.isCellEmpty() and the Cell.transparent doc comment.
  // Default: false (existing hosts are unaffected - erasing still resets
  // to fg:7,bg:0 with no transparent marker).
  transparentBackground?: boolean;
  /**
   * Mark transparent cells with a dim dot so a HOLE can be told from an
   * opaque black cell. Default FALSE: the guide annotates the art and the
   * art is what you are judging, so it is something you turn on when you
   * need it rather than something you look past.
   */
  showTransparencyGuide?: boolean;
  showLineNumbers?: boolean;
  showToolbar?: boolean;      // F-key character toolbar
  showStatusBar?: boolean;
  showMenuBar?: boolean;      // Moebius-style menu bar
  /**
   * Menus the HOST adds to this editor's own menu bar, after Help.
   *
   * A door that teaches this editor a new document kind - the sprite studio
   * and its Frame/Animation menus - needs its commands in THIS bar. Without
   * it the only way was a second menu bar drawn above the editor's own with
   * the editor's switched off, which is what made the sprite studio read as
   * two applications bolted together.
   */
  extraMenus?: HostMenu[];
  /**
   * The caller's BBS handle. Given one, View gains a Theme item that opens
   * the in-door theme menu, so an editor's colours can be changed without
   * leaving the editor. Omitted, the item is not shown at all - an item
   * that cannot work is worse than no item.
   */
  themeHost?: unknown;
  /**
   * The host's own re-theming, for colours it captured at startup (a
   * `door-theme.ts` module's bindings, a module-level T and S).
   */
  onThemeChange?: (theme: unknown) => void;
  /**
   * A one-row strip of the host's own controls, under the canvas.
   *
   * The place a drawing application puts playback and frame controls: near
   * the art, reachable with the mouse, out of the menus you would otherwise
   * open on every frame. It appears only when there is a spare row between
   * the canvas and the status bar, which is what makes it a WIDE-terminal
   * feature without knowing anything about terminal modes - at 80x25 with a
   * full-screen document there is no such row, and the strip stays away.
   */
  extraToolbar?: HostToolbarGroup[];
  showSidebar?: boolean;      // Left sidebar with colors & tools
  onSave?: (content: string) => Promise<boolean>;
  onSaveAs?: () => Promise<void>;  // Open save-as dialog
  /**
   * The host's own "new document", for a door whose document is not a bare
   * canvas. Without it File > New wiped the canvas and left the DOOR's
   * document behind it - a sprite studio with a blank editor and a sprite
   * still open ("most entries seem dead in the file menu", audited
   * 2026-09-02).
   */
  onNew?: () => void | Promise<void>;
  /**
   * Change the document's size. The widget can resize its own canvas, but a
   * door that owns a document (a sprite has cells, frames and animations)
   * has to resize THAT, so it is asked first.
   */
  onResize?: () => void | Promise<void>;
  onOpen?: () => Promise<void>;    // Open file browser dialog
  onOpenBBS?: () => Promise<void>; // Open BBS files (sysop only)
  onExit?: () => void;
  hideUIHotkey?: string; // Default: 'f2'
}

// Moebius F-key character sets (12 characters per set)
const FKEY_CHAR_SETS: string[][] = [
  // Set 1: Block/shade characters
  ['█', '▓', '▒', '░', '▀', '▄', '▌', '▐', '■', '□', '▪', '▫'],
  // Set 2: Box drawing - singles
  ['─', '│', '┌', '┐', '└', '┘', '├', '┤', '┬', '┴', '┼', '─'],
  // Set 3: Box drawing - doubles
  ['═', '║', '╔', '╗', '╚', '╝', '╠', '╣', '╦', '╩', '╬', '═'],
  // Set 4: Box drawing - mixed
  ['╓', '╖', '╙', '╜', '╒', '╕', '╘', '╛', '╞', '╡', '╥', '╨'],
  // Set 5: Arrows and symbols
  ['←', '→', '↑', '↓', '↔', '↕', '◄', '►', '▲', '▼', '◊', '♦'],
  // Set 6: Math and misc
  ['±', '×', '÷', '≤', '≥', '≠', '≈', '∞', '√', '∑', '∏', 'π'],
  // Set 7: Card suits and symbols
  ['♠', '♣', '♥', '♦', '☺', '☻', '☼', '♪', '♫', '†', '‡', '§'],
  // Set 8: Greek letters
  ['α', 'β', 'γ', 'δ', 'ε', 'θ', 'λ', 'μ', 'σ', 'τ', 'φ', 'ω'],
];

/**
 * The same glyph, drawn the other way round.
 *
 * The drawing cursor used to be an opaque red block with the brush
 * character in it, so whatever was under it could not be seen - fatal for
 * half-block art, where the cell you are about to paint is the one you most
 * need to look at ("the ansi/sprited don't change to half char when i hover
 * a halfchar... invert cart so halfchars are always visible even with
 * cursor on", 2026-09-02).
 *
 * Swapping the colour names in the tag string keeps the CHARACTER exactly
 * as the canvas drew it - including a magnified half-block's resolved
 * halves - and marks the position by reversing it, which is what a terminal
 * cursor has always been.
 */
export function invertTags(tag: string): string {
  return tag.replace(/\{(\/?)([a-z0-9-]+?)-(fg|bg)\}/gi,
    (_m, close: string, colour: string, kind: string) =>
      `{${close}${colour}-${kind === 'fg' ? 'bg' : 'fg'}}`);
}

/** A menu a host contributes to the editor's own menu bar. */
export interface HostMenu {
  label: string;
  items: DropdownMenuItem[];
}

/**
 * One segment of the host's strip under the canvas.
 *
 * A function label is re-read on every refreshExtraToolbar(), which is how a
 * readout ("3/12", "ONION on") stays true without the host rebuilding the
 * editor. No action means a readout rather than a button.
 */
export interface HostToolbarItem {
  label: string | (() => string);
  action?: () => void;
}

/** Segments that belong together; groups are separated by a divider. */
export type HostToolbarGroup = HostToolbarItem[];

/** The narrowest menu the editor draws, hotkey column included. */
export const MENU_ITEM_COLUMNS = 20;

/**
 * A menu item that says which key does the same thing.
 *
 * "all menu items needs to show hotkeys as well" - and a menu is where you
 * LEARN a hotkey, so an item with a key that does not name it teaches
 * nobody. The key is pushed to the right so the column reads down the menu.
 * Exported because a host's contributed menus must look like the editor's
 * own, or the bar has two conventions in it.
 */
export function menuItemLabel(text: string, key?: string): string {
  if (!key) return text;
  const gap = MENU_ITEM_COLUMNS - text.length - key.length;
  return gap > 0 ? `${text}${' '.repeat(gap)}${key}` : `${text}  ${key}`;
}

/** Wide enough for the longest label in a menu, borders included. */
export function menuWidthFor(items: Array<{ label: string }>): number {
  const longest = items.reduce((n, i) => Math.max(n, i.label.length), 0);
  return Math.max(MENU_ITEM_COLUMNS, longest) + 4;
}

export type EditorMode = 'text' | 'draw';

/**
 * Brush modes for drawing - Moebius-style
 */
export type BrushMode = 'text' | 'half-block' | 'custom' | 'shading' | 'colorize';

/**
 * Half-block characters for 2x vertical resolution
 */
const HALF_BLOCK = {
  UPPER: '▀',     // Upper half filled
  LOWER: '▄',     // Lower half filled
  FULL: '█',      // Both halves filled
  EMPTY: ' ',     // Neither half filled
  SHADE_LIGHT: '░',
  SHADE_MEDIUM: '▒',
  SHADE_DARK: '▓',
};

interface Position {
  line: number;
  col: number;
}

/**
 * Layer structure for multi-layer editing
 */
interface Layer {
  id: number;
  name: string;
  canvas: Cell[][];
  visible: boolean;
  locked: boolean;
  opacity: number;  // 0-100
}

/**
 * SAUCE record metadata (Standard Architecture for Universal Comment Extensions)
 * Used for ANSI art file metadata
 */
interface SAUCERecord {
  title: string;
  author: string;
  group: string;
  date: string;
  fileSize: number;
  dataType: number;
  fileType: number;
  tInfo1: number;  // Width for ANSI - NOT the size source of truth, see canvasW; reserved for future SAUCE serialization
  tInfo2: number;  // Height for ANSI - NOT the size source of truth, see canvasH; reserved for future SAUCE serialization
  tInfo3: number;
  tInfo4: number;
  comments: string[];
  tFlags: number;
  tInfoS: string;
}

/**
 * Main ANSI Editor Widget
 */
export class ANSIEditor extends Box {
  // UI Components - Main Areas
  private viewport!: Box;
  private drawCanvas!: Canvas;
  private drawCursor!: Box;  // Cursor overlay for draw mode
  private statusBar!: Text;

  // Moebius-style UI Components
  private menuBar?: Box;               // Menu bar container
  private fkeyToolbar?: Box;           // F1-F12 character toolbar
  private sidebar?: Box;               // Left sidebar with colors & tools
  private colorPalette?: Box;          // Color palette in sidebar
  private toolPanel?: Box;             // Tool buttons in sidebar

  // Menu dropdowns
  private fileMenu?: DropdownMenu;
  private editMenu?: DropdownMenu;
  private selectionMenu?: DropdownMenu;
  private colorsMenu?: DropdownMenu;
  private viewMenu?: DropdownMenu;
  private helpMenu?: DropdownMenu;
  /**
   * A canvas drawn UNDER this one, dimmed, wherever a cell is empty.
   *
   * Presentation only, and that is the whole safety property: it is never
   * merged, never returned by getCoreCanvas(), never saved. A sprite editor
   * hands over the previous frame to make onion skin; the editor itself has
   * no idea what a frame is.
   */
  private underlayCanvas: Cell[][] | null = null;
  private transparencyGuide = false;

  /** Host-contributed menus, in bar order after Help. */
  private extraMenus: HostMenu[] = [];
  private themeHost: unknown;
  private onThemeChange?: (theme: unknown) => void;
  private extraMenuDropdowns: DropdownMenu[] = [];

  /** Host-contributed controls, on the right of the status bar. */
  private extraToolbar: HostToolbarGroup[] = [];
  private extraToolbarBar?: Box;
  /** Columns the strip occupies, which the status bar must not paint into. */
  private extraToolbarWidth = 0;

  // F-key toolbar state
  private fkeySetIndex: number = 0;    // Current character set (0-7)
  private fkeyButtons: Box[] = [];     // F1-F12 character preview buttons

  // Editor State
  private mode: EditorMode = 'draw';  // Default to draw mode
  private lines: string[] = [];
  private cursor: Position = { line: 0, col: 0 };
  private scrollTop: number = 0;
  private scrollLeft: number = 0;
  private modified: boolean = false;

  // Drawing state - uses core library Cell type
  private currentFg: number = 7;
  private currentBg: number = 0;
  private currentChar: string = '█';
  private cellCanvas: Cell[][] | null = null;  // Core library canvas
  private currentTool: DrawingTool = 'text';  // Default to text/typing mode (Moebius-style)
  private isDrawing: boolean = false;

  // Core editor state for tool operations
  private coreState: CoreEditorState | null = null;

  // Undo/Redo - use core library undo system for draw mode
  private undoStack: string[] = [];  // For text mode
  private redoStack: string[] = [];

  // Layer System
  private layers: Layer[] = [];
  private activeLayerIndex: number = 0;
  private nextLayerId: number = 1;
  private layerPanel?: Box;
  private layerMenu?: DropdownMenu;

  // SAUCE Metadata
  private sauce: SAUCERecord = {
    title: '',
    author: '',
    group: '',
    date: new Date().toISOString().slice(0, 8).replace(/-/g, ''),
    fileSize: 0,
    dataType: 1,  // Character (ANSI)
    fileType: 1,  // ANSi
    tInfo1: 0,    // Width - set from canvas size in constructor
    tInfo2: 0,    // Height - set from canvas size in constructor
    tInfo3: 0,
    tInfo4: 0,
    comments: [],
    tFlags: 0,
    tInfoS: '',
  };

  // iCE Colors (16 background colors instead of 8 + blink)
  private iceColorsEnabled: boolean = false;

  // Clipboard for cut/copy/paste
  private clipboard: Cell[][] | null = null;

  // Selection state
  private selection: { x1: number; y1: number; x2: number; y2: number } | null = null;

  // Brush mode state (Moebius-style)
  private brushMode: BrushMode = 'text';
  private halfBlockSubY: 0 | 1 = 0;  // 0 = upper half, 1 = lower half

  // Repaint-throttle guard for shape-tool drag preview (skip redundant work
  // when the mouse reports the same cell twice in a row).
  private lastPreviewPos: { x: number; y: number } | null = null;

  // Options
  private maxLines: number;
  private maxLineLength: number;
  // Draw-mode canvas dimensions. Bootstrap fallback only - once cellCanvas
  // is allocated, canvasW/canvasH below always read the real array so a
  // later setCoreCanvas() with a differently-sized canvas is reflected
  // automatically.
  private optCanvasWidth: number;
  private optCanvasHeight: number;
  // Presentation-only magnification, in characters per cell. Unlike the
  // dimensions above there is no live array to read them back from - a
  // canvas knows its size, not how large it is being drawn - so these
  // fields ARE the source, read only through the scaleX/scaleY getters.
  private optCellScaleX: number;
  private optCellScaleY: number;
  // When true, freshly-allocated canvases (construction, File > New) start
  // all-transparent and eraseAtCursor() marks a cell transparent instead of
  // resetting it to an opaque fg:7,bg:0 space. See createBlankCanvas().
  private transparentBackground: boolean;
  private showLineNumbers: boolean;
  private onSaveCallback?: (content: string) => Promise<boolean>;
  private onSaveAsCallback?: () => Promise<void>;
  private onNewCallback?: () => void | Promise<void>;
  private onResizeCallback?: () => void | Promise<void>;
  private onOpenCallback?: () => Promise<void>;
  private onOpenBBSCallback?: () => Promise<void>;
  private onExitCallback?: () => void;
  private hideUIHotkey: string;
  private uiVisible: boolean = true;
  private modalOpen: boolean = false;
  /** The dialog currently holding the keyboard, if any. */
  private modalTrap?: any;

  /**
   * Draw-mode canvas width/height. These two getters are the ONLY source of
   * canvas dimensions in the widget - every bound check, allocation, and
   * loop reads through here instead of a hardcoded 80/25 literal. Before
   * cellCanvas is allocated (during construction) they fall back to the
   * requested option; afterward they always reflect the real array, so a
   * later setCoreCanvas() swap with a different-sized canvas "just works".
   */
  private get canvasW(): number { return this.cellCanvas?.[0]?.length ?? this.optCanvasWidth; }
  private get canvasH(): number { return this.cellCanvas?.length ?? this.optCanvasHeight; }

  /**
   * Characters per cell across and rows per cell down. The ONLY source of
   * magnification: buildCanvasContent() repeats by them, screenToCanvasX/Y
   * divide by them, and updateDrawCursor() multiplies by them, so the
   * render and the hit-test can never be scaled by two different numbers.
   */
  private get scaleX(): number { return this.optCellScaleX; }
  private get scaleY(): number { return this.optCellScaleY; }

  /** Get the current draw-mode canvas dimensions in cells. */
  getCanvasSize(): { width: number; height: number } {
    return { width: this.canvasW, height: this.canvasH };
  }

  /**
   * Show (or clear) a ghost canvas beneath the empty cells of this one.
   * Pass null to remove it. Cells outside its bounds simply have no ghost.
   */
  /** Show or hide the dim dot that marks a transparent cell. */
  setTransparencyGuide(on: boolean): void {
    this.transparencyGuide = on;
    if (this.mode === 'draw') {
      this.syncCoreCanvasToDisplay();
      this.screen?.render();
    }
  }

  isTransparencyGuideOn(): boolean {
    return this.transparencyGuide;
  }

  setUnderlay(canvas: Cell[][] | null): void {
    this.underlayCanvas = canvas;
    if (this.mode === 'draw') {
      this.syncCoreCanvasToDisplay();
      this.screen?.render();
    }
  }

  /**
   * Show or hide the drawing cursor.
   *
   * A host that animates the canvas has to be able to take the caret off
   * it: playback in the sprite studio drew frame after frame with the
   * cursor sitting on top of the art - "when anims play the cursor/caret
   * must be hidden" (2026-09-02).
   */
  setCursorVisible(visible: boolean): void {
    if (!this.drawCursor) return;
    if (visible) {
      this.drawCursor.show();
      this.updateDrawCursor();
    } else {
      this.drawCursor.hide();
    }
    this.screen?.render();
  }

  /** Get the current magnification, in characters per cell. */
  getCellScale(): { x: number; y: number } {
    return { x: this.scaleX, y: this.scaleY };
  }

  /** Full-canvas selection bounds - the default when no explicit selection exists. */
  private fullCanvasSelection(): { x1: number; y1: number; x2: number; y2: number } {
    return { x1: 0, y1: 0, x2: this.canvasW - 1, y2: this.canvasH - 1 };
  }

  /** Clamp a column into the canvas's horizontal bounds [0, canvasW - 1]. */
  private clampCol(col: number): number {
    return Math.max(0, Math.min(this.canvasW - 1, col));
  }

  /** Clamp a row into the canvas's vertical bounds [0, canvasH - 1]. */
  private clampLine(line: number): number {
    return Math.max(0, Math.min(this.canvasH - 1, line));
  }

  /**
   * Rendered column/row -> canvas column/row: the inverse of the repeat
   * buildCanvasContent() applies. Every mouse path goes through these, so a
   * click lands on the cell the artist actually pointed at whatever the
   * magnification; at the default 1/1 they reduce to the plain clamp the
   * handlers used before.
   */
  private screenToCanvasX(x: number): number { return this.clampCol(Math.floor(x / this.scaleX)); }
  private screenToCanvasY(y: number): number { return this.clampLine(Math.floor(y / this.scaleY)); }

  /** Clamp the live cursor position into the current canvas's bounds. */
  private clampCursorToCanvas(): void {
    this.cursor.col = this.clampCol(this.cursor.col);
    this.cursor.line = this.clampLine(this.cursor.line);
  }

  /**
   * Allocate a blank width x height canvas. When transparentBackground is
   * on, every cell starts marked `transparent: true` instead of the plain
   * opaque {char:' ', fg:7, bg:0} CoreCanvas.createCanvas() always builds -
   * the same distinction eraseAtCursor() applies to a single cell. Used at
   * construction and by newDocument() (File > New); a freshly-added layer
   * stays a plain CoreCanvas.createCanvas() call, out of this task's scope.
   */
  private createBlankCanvas(width: number, height: number): Cell[][] {
    const canvas = CoreCanvas.createCanvas(width, height);
    if (this.transparentBackground) {
      for (const row of canvas) {
        for (const cell of row) {
          cell.transparent = true;
        }
      }
    }
    return canvas;
  }

  constructor(options: ANSIEditorOptions = {}) {
    super({
      ...options,
      border: options.border || { type: 'line', fg: 'cyan' },
      label: options.label || ` ${options.title || 'ANSI Editor'} `,
      tags: true,
      keys: true,
      mouse: true,
      vi: true,
    });

    this.mode = options.initialMode || 'draw'; // Default to draw mode
    this.maxLines = options.maxLines || 1000;
    this.maxLineLength = options.maxLineLength || 160;
    this.optCanvasWidth = options.canvasWidth || 80;
    this.optCanvasHeight = options.canvasHeight || 25;
    // Floored and floored to at least 1: a fractional or zero scale would
    // put the render and the hit-test on different grids, and a negative
    // one would build an empty row - a silently blank canvas.
    this.extraMenus = options.extraMenus ?? [];
    this.themeHost = options.themeHost;
    this.onThemeChange = options.onThemeChange;
    this.extraToolbar = options.extraToolbar ?? [];
    this.transparencyGuide = options.showTransparencyGuide ?? false;
    this.optCellScaleX = Math.max(1, Math.floor(options.cellScaleX ?? 1));
    this.optCellScaleY = Math.max(1, Math.floor(options.cellScaleY ?? 1));
    this.transparentBackground = options.transparentBackground ?? false;
    this.showLineNumbers = options.showLineNumbers ?? true;
    this.onSaveCallback = options.onSave;
    this.onSaveAsCallback = options.onSaveAs;
    this.onNewCallback = options.onNew;
    this.onResizeCallback = options.onResize;
    this.onOpenCallback = options.onOpen;
    this.onOpenBBSCallback = options.onOpenBBS;
    this.onExitCallback = options.onExit;
    this.hideUIHotkey = options.hideUIHotkey || 'f2';

    // Initialize core canvas (defaults to 80x25 standard ANSI size)
    this.cellCanvas = this.createBlankCanvas(this.canvasW, this.canvasH);
    // sauce.tInfo1/tInfo2 are intentionally NOT cached here - a construction-time
    // snapshot would desync from the real canvas after any resize (setCoreCanvas),
    // exactly the kind of second source of truth this widget is being cleaned of.
    // The one place that displays canvas size in the SAUCE record (showSauceEditor)
    // reads this.canvasW/this.canvasH live instead. tInfo1/tInfo2 stay at their
    // struct-required placeholder (0) - they exist for a future real SAUCE
    // serialization path, not as the size source of truth.

    // Parse initial content
    if (options.initialContent) {
      this.lines = options.initialContent.split('\n');
      if (this.lines.length > this.maxLines) {
        this.lines = this.lines.slice(0, this.maxLines);
      }
      // Parse ANSI content into cell canvas for draw mode
      CoreCanvas.parseANSIToCanvas(this.cellCanvas, options.initialContent);
    } else {
      this.lines = [''];
    }

    // Save initial state for undo
    this.saveUndoState();

    // Initialize layer system with default layer
    this.layers = [{
      id: this.nextLayerId++,
      name: 'Layer 1',
      canvas: this.cellCanvas,
      visible: true,
      locked: false,
      opacity: 100,
    }];
    this.activeLayerIndex = 0;

    // Initialize core editor state for tool operations (future use for advanced tool handlers)
    this.coreState = new CoreEditorState();
    this.coreState.setCanvas(CoreCanvas.cloneCanvas(this.cellCanvas));

    this.createUI(options);
    this.setupKeyHandlers();
    this.setupMouseHandlers();

    // Sync canvas to display (always in draw mode - ensures clean state)
    if (this.mode === 'draw') {
      this.syncCoreCanvasToDisplay();
    }

    // Focus the appropriate element based on mode
    if (this.mode === 'draw') {
      this.drawCanvas.focus();
    } else {
      this.viewport.focus();
    }
  }

  /**
   * Where the draw canvas sits, and how big it is.
   *
   * Sized to the canvas's own extent (cells times scale) and centred in the
   * region left over after the sidebar, the chrome above and the status bar
   * below. Clamped so a canvas at least as large as the room starts flush
   * where it always did - centring must never push content off the top or
   * the left, which is the usual way this goes wrong.
   */
  private centredCanvasGeometry(topOffset: number, sidebarWidth: number, showStatusBar: boolean): {
    top: number; left: number; width: number; height: number;
  } {
    const width = this.canvasW * this.scaleX;
    const height = this.canvasH * this.scaleY;

    const roomW = (this.width as number) - sidebarWidth;
    const roomH = (this.height as number) - topOffset - (showStatusBar ? 1 : 0);

    const left = sidebarWidth + Math.max(0, Math.floor((roomW - width) / 2));
    const top = topOffset + Math.max(0, Math.floor((roomH - height) / 2));
    return { top, left, width, height };
  }

  private createUI(options: ANSIEditorOptions): void {
    // Calculate layout offsets based on enabled UI components
    let topOffset = 0;
    const showMenuBar = options.showMenuBar !== false;
    const showToolbar = options.showToolbar !== false;
    const showSidebar = options.showSidebar !== false;
    const showStatusBar = options.showStatusBar !== false;

    // Calculate sidebar width (7 chars for compact layout)
    const sidebarWidth = showSidebar ? 6 : 0;

    // 1. Menu bar at top (Moebius-style)
    if (showMenuBar) {
      this.createMenuBar();
      topOffset = 1;
    }

    // 2. F-key character toolbar below menu bar
    if (showToolbar) {
      this.createFkeyToolbar(topOffset);
      topOffset += 1; // F-key toolbar is 1 row
    }

    // 3. Left sidebar with colors & tools
    if (showSidebar) {
      this.createSidebar(topOffset, showStatusBar);
    }

    // 4. Main viewport (for text mode)
    this.viewport = new Box({
      parent: this,
      top: topOffset,
      left: sidebarWidth,
      right: 0,
      bottom: showStatusBar ? 1 : 0,
      style: { bg: 'black', fg: 'white' },
      scrollable: true,
      alwaysScroll: true,
      keys: true,
      mouse: true,
      vi: true,
      focusable: true,
      clickable: true,
      input: true,
      wrap: false, // ANSI content is fixed width - never wrap
    });

    // 5. Canvas (for draw mode), CENTRED in the room it has.
    //
    // A 5x2 sprite pinned to the top-left of an 80x25 editor reads as an
    // accident - "can we center the sprites in the sprited canvas?". The
    // box is sized to the canvas rather than filling the region, and placed
    // in the middle of what is left after the sidebar and the chrome. A
    // canvas that fills the room gets no offset, so the 80x25 hosts are
    // unchanged. The mouse handlers subtract drawCanvas.ileft/itop and the
    // cursor reads drawCanvas.position, so both follow the box for free.
    const canvasGeom = this.centredCanvasGeometry(topOffset, sidebarWidth, showStatusBar);
    this.drawCanvas = new Canvas({
      parent: this,
      top: canvasGeom.top,
      left: canvasGeom.left,
      width: canvasGeom.width,
      height: canvasGeom.height,
      style: { bg: 'black', fg: 'white' },
      keys: true,
      mouse: true,
      focusable: true,
      clickable: true,
      input: true,
      wrap: false, // ANSI canvas is fixed-width - never wrap
      fillChar: this.currentChar,
      clearChar: ' ',
    });

    // Enable all-motion mouse tracking when canvas is focused
    this.drawCanvas.on('focus', () => {
      if (this.screen && (this.screen as any).program) {
        (this.screen as any).program.setMouse({ allMotion: true }, true);
      }
    });

    this.drawCanvas.on('blur', () => {
      if (this.screen && (this.screen as any).program) {
        (this.screen as any).program.setMouse({ allMotion: false }, true);
      }
    });

    // 6. Cursor overlay for draw mode
    this.drawCursor = new Box({
      parent: this,
      top: topOffset,
      left: sidebarWidth,
      width: 1,
      height: 1,
      content: '█',
      style: { bg: 'red', fg: 'red' },
      tags: true,
      clickable: false,
      mouse: false,
    });
    // Ensure cursor renders above canvas
    this.drawCursor.setFront();

    // Set initial visibility based on mode
    if (this.mode === 'draw') {
      this.viewport.hide();
      this.drawCanvas.show();
      this.drawCursor.show();
    } else {
      this.viewport.show();
      this.drawCanvas.hide();
      this.drawCursor.hide();
    }

    // 7. Status bar (Moebius-style)
    if (showStatusBar) {
      this.statusBar = new Text({
        parent: this,
        bottom: 0,
        left: 0,
        width: '100%',
        height: 1,
        content: '',
        style: { bg: 'blue', fg: 'white' },
        tags: true,
      });
    }

    // 8. The host's own controls, on the right of that status bar.
    this.createExtraToolbar();

    // Initial render
    this.updateDisplay();
  }

  /**
   * Create Moebius-style menu bar with dropdown menus
   */
  private createMenuBar(): void {
    this.menuBar = new Box({
      parent: this,
      top: 0,
      left: 0,
      width: '100%',
      height: 1,
      // The theme's primary colour, like every other menu bar
      // (widgets/menu-bar.ts).
      style: { bg: activeTheme().tokens.accent, fg: activeTheme().tokens.ground },
      tags: true,
    });

    // Menu button positions, derived from the labels rather than written
    // down beside them. The old literals only happened to match the label
    // lengths; renaming ' Select ' to ' Sel ' would have left a gap or an
    // overlap, and a host adding menus of its own could not have placed
    // them at all.
    const ownLabels = [' File ', ' Edit ', ' Layer ', ' Select ', ' Colors ', ' View ', ' Help '];
    const hostLabels = this.extraMenus.map(m => ` ${m.label} `);
    let nextLeft = 0;
    const menus = [...ownLabels, ...hostLabels].map(label => {
      const left = nextLeft;
      nextLeft += label.length;
      return { label, left };
    });

    // Store button references for anchor registration
    const menuButtons: Box[] = [];
    menus.forEach((menu) => {
      const btn = new Box({
        parent: this.menuBar,
        top: 0,
        left: menu.left,
        width: menu.label.length,
        height: 1,
        content: menu.label,
        style: {
          bg: activeTheme().tokens.accent,
          fg: activeTheme().tokens.ground,
          hover: { bg: activeTheme().tokens.ground, fg: activeTheme().tokens.accent },
        },
        tags: true,
        mouse: true,
        clickable: true,
      });
      menuButtons.push(btn);
    });

    // Create dropdown menus (hidden initially)
    this.createDropdownMenus();

    // Register anchors for hover-to-open behavior
    // Positions are now calculated dynamically from anchor coordinates.
    // Host menus follow the widget's own, in the same order their buttons
    // were laid out above, so button N always opens dropdown N.
    const dropdownMenus = [
      this.fileMenu,
      this.editMenu,
      this.layerMenu,
      this.selectionMenu,
      this.colorsMenu,
      this.viewMenu,
      this.helpMenu,
      ...this.extraMenuDropdowns,
    ];
    menuButtons.forEach((btn, idx) => {
      const dropdown = dropdownMenus[idx];
      if (dropdown) {
        dropdown.registerAnchor(btn);  // Position calculated dynamically from btn coords
      }
    });
  }

  /**
   * Open the theme menu over the editor.
   *
   * The panel previews as the highlight moves - it re-tints every widget on
   * screen, this editor included - and the host re-points whatever colours
   * it captured at startup through `onThemeChange`.
   */
  private openThemePanel(): void {
    if (!this.screen || !this.themeHost) return;
    void openThemeMenu({
      screen: this.screen,
      bbs: this.themeHost,
      onApply: (theme) => this.onThemeChange?.(theme),
    }).then(() => this.screen?.render());
  }

  /**
   * Create dropdown menus for the menu bar
   */
  private createDropdownMenus(): void {
    if (!this.screen) return;

    // Host menus first so they exist before the anchor registration below
    // walks them. Their items are used as given - a host owns what its own
    // menu says and does.
    this.extraMenuDropdowns = this.extraMenus.map(menu => new DropdownMenu({
      parent: this.screen,
      // Wide enough for the host's own longest label. A fixed 22 clipped
      // the hotkey off the end of the label it was added to, which is the
      // one part of a menu item nobody can guess.
      width: menuWidthFor(menu.items),
      items: menu.items,
    }));

    // File menu - build items dynamically based on available callbacks
    // Only what is WIRED. An item whose host callback is missing does
    // nothing when chosen, which is indistinguishable from a broken editor
    // - and File > Save As was exactly that in the sprite studio.
    const fileMenuItems: any[] = [
      { label: 'New', action: () => { void (this.onNewCallback ? this.onNewCallback() : this.newDocument()); } },
    ];
    if (this.onOpenCallback) {
      fileMenuItems.push({ label: 'Open...', action: () => this.onOpenCallback?.() });
    }

    // Add BBS files option for sysops (only if callback provided)
    if (this.onOpenBBSCallback) {
      fileMenuItems.push({ label: 'Open BBS Files...', action: () => this.onOpenBBSCallback?.() });
    }

    fileMenuItems.push(
      { label: '────────────────', separator: true },
      { label: menuItemLabel('Save', 'C-s'), action: () => this.save() },
    );
    if (this.onSaveAsCallback) {
      fileMenuItems.push({ label: 'Save As...', action: () => this.onSaveAsCallback?.() });
    }
    fileMenuItems.push(
      { label: '────────────────', separator: true },
      { label: 'Canvas Size...', action: () => { void this.changeCanvasSize(); } },
      { label: 'SAUCE Info...', action: () => this.showSauceEditor() },
      { label: '────────────────', separator: true },
      { label: menuItemLabel('Exit', 'ESC'), action: () => this.onExitCallback?.() },
    );

    this.fileMenu = new DropdownMenu({
      parent: this.screen,
      width: menuWidthFor(fileMenuItems),
      items: fileMenuItems,
    });

    // Edit menu
    this.editMenu = new DropdownMenu({
      parent: this.screen,
      width: MENU_ITEM_COLUMNS + 4,
      items: [
        { label: menuItemLabel('Undo', 'C-z'), action: () => this.undo() },
        { label: menuItemLabel('Redo', 'C-y'), action: () => this.redo() },
        { label: '────────────────', separator: true },
        { label: 'Cut', action: () => this.cutSelection() },
        { label: 'Copy', action: () => this.copySelection() },
        { label: 'Paste', action: () => this.pasteClipboard() },
        { label: '────────────────', separator: true },
        { label: 'Insert Row', action: () => this.insertRow() },
        { label: 'Delete Row', action: () => this.deleteRow() },
      ],
    });

    // Selection menu
    this.selectionMenu = new DropdownMenu({
      parent: this.screen,
      width: MENU_ITEM_COLUMNS + 4,
      items: [
        { label: 'Select All', action: () => this.selectAll() },
        { label: 'Deselect', action: () => this.deselect() },
        { label: '────────────────', separator: true },
        { label: 'Move Block', action: () => this.moveBlock() },
        { label: 'Copy Block', action: () => this.copyBlock() },
        { label: '────────────────', separator: true },
        { label: 'Flip Horizontal', action: () => this.flipHorizontal() },
        { label: 'Flip Vertical', action: () => this.flipVertical() },
      ],
    });

    // Colors menu
    this.colorsMenu = new DropdownMenu({
      parent: this.screen,
      width: MENU_ITEM_COLUMNS + 4,
      items: [
        { label: menuItemLabel('Foreground...', 'A-c'), action: () => this.showColorPicker(true) },
        { label: menuItemLabel('Background...', 'A-b'), action: () => this.showColorPicker(false) },
        { label: '────────────────', separator: true },
        { label: 'Swap FG/BG', action: () => this.swapColors() },
        { label: 'Default Colors', action: () => this.resetColors() },
        { label: '────────────────', separator: true },
        { label: this.iceColorsEnabled ? '[X] iCE Colors' : '[ ] iCE Colors', action: () => this.toggleIceColors() },
      ],
    });

    // Layer menu
    this.layerMenu = new DropdownMenu({
      parent: this.screen,
      width: MENU_ITEM_COLUMNS + 4,
      items: [
        { label: 'Add Layer', action: () => this.addLayer() },
        { label: 'Delete Layer', action: () => this.deleteLayer() },
        { label: '────────────────', separator: true },
        { label: 'Merge Down', action: () => this.mergeLayerDown() },
        { label: 'Flatten All', action: () => this.flattenLayers() },
        { label: '────────────────', separator: true },
        { label: 'Toggle Visibility', action: () => this.toggleLayerVisibility() },
        { label: 'Toggle Lock', action: () => this.toggleLayerLock() },
        { label: '────────────────', separator: true },
        { label: 'Move Up', action: () => this.moveLayerUp() },
        { label: 'Move Down', action: () => this.moveLayerDown() },
      ],
    });

    // View menu
    this.viewMenu = new DropdownMenu({
      parent: this.screen,
      width: MENU_ITEM_COLUMNS + 4,
      items: [
        { label: 'Toggle Sidebar', action: () => this.toggleSidebar() },
        { label: 'Toggle Toolbar', action: () => this.toggleFkeyToolbar() },
        { label: '────────────────', separator: true },
        { label: menuItemLabel('Text Mode', 'C-m'), action: () => this.mode !== 'text' && this.toggleMode() },
        { label: menuItemLabel('Draw Mode', 'C-m'), action: () => this.mode !== 'draw' && this.toggleMode() },
        ...(this.themeHost
          ? [
              { label: '────────────────', separator: true },
              { label: 'Theme...', action: () => this.openThemePanel() },
            ]
          : []),
      ],
    });

    // Help menu
    this.helpMenu = new DropdownMenu({
      parent: this.screen,
      width: MENU_ITEM_COLUMNS + 4,
      items: [
        { label: menuItemLabel('Keyboard Shortcuts', '?'), action: () => this.showHelp() },
        { label: '────────────────', separator: true },
        { label: 'About ANSI Editor', action: () => this.showAbout() },
      ],
    });
  }

  /**
   * Open a dropdown menu
   */
  private openMenu(index: number): void {
    const menus = [
      { menu: this.fileMenu, left: 0 },
      { menu: this.editMenu, left: 6 },
      { menu: this.layerMenu, left: 12 },
      { menu: this.selectionMenu, left: 19 },
      { menu: this.colorsMenu, left: 28 },
      { menu: this.viewMenu, left: 36 },
      { menu: this.helpMenu, left: 42 },
    ];

    const item = menus[index];
    if (item?.menu) {
      item.menu.openAt(item.left + this.aleft + 1, this.atop + 2);
    }
  }

  /**
   * The host's controls, on the RIGHT of the status bar.
   *
   * They floated in a framed strip under the canvas for one commit and the
   * sysop's verdict was "this was an ugly toolbar - move it to the footer
   * on the right side instead". The footer is the right home: the editor
   * already has exactly one row of chrome at the bottom, it is always
   * there, and it needs no room test, no repositioning when the canvas
   * moves, and no rule about what happens at 80 columns.
   *
   * Segments are boxes over the status bar's own text rather than part of
   * its content, because a segment is clickable - the same shape the F-key
   * toolbar's buttons have. The status bar drops its own optional readouts
   * when the strip needs the room (see updateStatusBar).
   */
  private createExtraToolbar(): void {
    if (this.extraToolbar.length === 0 || !this.statusBar) return;

    const bar = new Box({
      parent: this.statusBar,
      top: 0,
      right: 0,
      width: 1,          // sized to its content by layoutExtraToolbar()
      height: 1,
      style: { bg: 'blue', fg: 'white' },
      tags: true,
      focusable: false,
    });
    this.extraToolbarBar = bar;
    this.layoutExtraToolbar();
  }

  /** Place the segments, and size the strip to what they came to. */
  private layoutExtraToolbar(): void {
    const bar = this.extraToolbarBar;
    if (!bar) return;

    for (const child of bar.children.slice()) child.destroy();

    let x = 0;
    this.extraToolbar.forEach((group, g) => {
      if (g > 0) {
        new Text({
          parent: bar,
          top: 0, left: x, width: 3, height: 1,
          content: ' · ',
          style: { bg: 'blue', fg: 'white' },
          tags: true,
        });
        x += 3;
      }
      group.forEach((item, i) => {
        if (i > 0) x += 1;
        const text = typeof item.label === 'function' ? item.label() : item.label;
        const segment = new Box({
          parent: bar,
          top: 0, left: x, width: text.length, height: 1,
          content: text,
          style: item.action
            ? { bg: 'blue', fg: 'white', hover: { bg: 'cyan', fg: 'black' } }
            : { bg: 'blue', fg: 'lightcyan' },
          tags: true,
          mouse: Boolean(item.action),
          clickable: Boolean(item.action),
          focusable: false,
        });
        if (item.action) segment.on('click', () => item.action!());
        x += text.length;
      });
    });

    bar.width = x;
    this.extraToolbarWidth = x;
  }

  /**
   * Take the menus down with the editor.
   *
   * The dropdowns are parented to the SCREEN, not to this widget, because a
   * menu must paint over everything - so Element.destroy()'s sweep of its
   * own children never reached them. A host that REBUILDS the editor (a
   * zoom step, a resize, opening another document - the sprite studio does
   * all three) left eleven hidden dropdowns behind every time, each holding
   * an action closing over the editor that had just been destroyed.
   */
  destroy(): void {
    for (const menu of [
      this.fileMenu, this.editMenu, this.selectionMenu, this.colorsMenu,
      this.layerMenu, this.viewMenu, this.helpMenu, ...this.extraMenuDropdowns,
    ]) {
      menu?.destroy();
    }
    this.extraMenuDropdowns = [];
    super.destroy();
  }

  /**
   * Re-read the strip's labels.
   *
   * A host calls this when the state a readout shows has changed - the
   * frame number, whether it is playing - rather than rebuilding the editor
   * for a two-character difference.
   */
  refreshExtraToolbar(): void {
    if (!this.extraToolbarBar) return;
    this.layoutExtraToolbar();
    this.updateStatusBar();
    this.screen?.render();
  }

  /**
   * Create F-key character toolbar (Moebius-style)
   */
  private createFkeyToolbar(topOffset: number): void {
    this.fkeyToolbar = new Box({
      parent: this,
      top: topOffset,
      left: 0,
      width: '100%',
      height: 1,
      style: { bg: 'black', fg: 'white' },
      tags: true,
    });

    // Character set selector (< and >) - horizontal on single row
    const prevBtn = new Text({
      parent: this.fkeyToolbar,
      top: 0,
      left: 0,
      width: 1,
      height: 1,
      content: '{cyan-fg}<{/cyan-fg}',
      style: { bg: 'black', fg: 'white', hover: { bg: 'blue' } },
      tags: true,
      mouse: true,
      clickable: true,
    });
    prevBtn.on('click', () => this.prevFkeySet());

    // Set number display
    new Text({
      parent: this.fkeyToolbar,
      top: 0,
      left: 1,
      width: 1,
      height: 1,
      content: `${this.fkeySetIndex + 1}`,
      style: { bg: 'black', fg: 'cyan' },
      tags: true,
    });

    const nextBtn = new Text({
      parent: this.fkeyToolbar,
      top: 0,
      left: 2,
      width: 1,
      height: 1,
      content: '{cyan-fg}>{/cyan-fg}',
      style: { bg: 'black', fg: 'white', hover: { bg: 'blue' } },
      tags: true,
      mouse: true,
      clickable: true,
    });
    nextBtn.on('click', () => this.nextFkeySet());

    // F1-F12 character buttons - single row, compact (5 chars each: "F1█ ")
    this.fkeyButtons = [];
    for (let i = 0; i < 12; i++) {
      const fkeyBtn = new Box({
        parent: this.fkeyToolbar,
        top: 0,
        left: 4 + i * 5,  // All on single row
        width: 5,
        height: 1,
        content: this.getFkeyButtonContent(i),
        style: { bg: 'black', fg: 'white', hover: { bg: 'blue' } },
        tags: true,
        mouse: true,
        clickable: true,
      });
      fkeyBtn.on('click', () => this.selectFkeyChar(i));
      this.fkeyButtons.push(fkeyBtn);
    }
  }

  /**
   * Get F-key button content (e.g., "F1█")
   */
  private getFkeyButtonContent(index: number): string {
    const fkeyNum = index + 1;
    const fkeyLabel = fkeyNum <= 9 ? `F${fkeyNum}` : (fkeyNum === 10 ? '10' : (fkeyNum === 11 ? '11' : '12'));
    const char = FKEY_CHAR_SETS[this.fkeySetIndex]?.[index] || '?';
    // Compact format: "F1█" or "12█" for F10-F12
    return `{cyan-fg}${fkeyLabel}{/}{white-fg}${char}{/}`;
  }

  /**
   * Update F-key toolbar characters
   */
  private updateFkeyToolbar(): void {
    if (!this.fkeyToolbar) return;

    // Update F-key buttons
    this.fkeyButtons.forEach((btn, i) => {
      btn.setContent(this.getFkeyButtonContent(i));
    });

    this.screen?.render();
  }

  /**
   * Go to previous F-key character set
   */
  private prevFkeySet(): void {
    this.fkeySetIndex = (this.fkeySetIndex - 1 + FKEY_CHAR_SETS.length) % FKEY_CHAR_SETS.length;
    this.updateFkeyToolbar();
  }

  /**
   * Go to next F-key character set
   */
  private nextFkeySet(): void {
    this.fkeySetIndex = (this.fkeySetIndex + 1) % FKEY_CHAR_SETS.length;
    this.updateFkeyToolbar();
  }

  /**
   * Select a character from F-key toolbar
   */
  private selectFkeyChar(index: number): void {
    const char = FKEY_CHAR_SETS[this.fkeySetIndex]?.[index];
    if (char) {
      this.currentChar = char;
      this.drawCursor.setContent(char);
      this.updateStatusBar();
      this.screen?.render();
    }
  }

  /**
   * Create left sidebar with color palette and tool buttons (Moebius-style)
   */
  private createSidebar(topOffset: number, showStatusBar: boolean): void {
    this.sidebar = new Box({
      parent: this,
      top: topOffset,
      left: 0,
      width: 6,
      bottom: showStatusBar ? 1 : 0,
      style: { bg: 'black', fg: 'white' },
      tags: true,
    });

    // Color palette (2 columns x 8 rows = 16 colors, Moebius-style vertical layout)
    this.colorPalette = new Box({
      parent: this.sidebar,
      top: 0,
      left: 0,
      width: 6,
      height: 8,
      tags: true,
    });

    // Create color swatches - 2 columns x 8 rows (Moebius layout)
    // Left column: dark colors (0-7), Right column: bright colors (8-15)
    const colors = [
      'black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white',
      'gray', 'lightred', 'lightgreen', 'lightyellow', 'lightblue', 'lightmagenta', 'lightcyan', 'lightwhite',
    ];

    for (let i = 0; i < 16; i++) {
      const row = i % 8;              // 0-7 (8 rows)
      const col = Math.floor(i / 8);  // 0 or 1 (2 columns)
      const swatch = new Box({
        parent: this.colorPalette,
        top: row,
        left: col * 3,
        width: 3,
        height: 1,
        content: '   ',
        style: { bg: colors[i] },
        mouse: true,
        clickable: true,
      });
      swatch.on('click', (data: any) => {
        if (data.button === 'left') {
          this.currentFg = i;
        } else if (data.button === 'right') {
          this.currentBg = i;
        }
        this.updateStatusBar();
        this.updateSidebarFGBG();
        this.screen?.render();
      });
    }

    // FG/BG indicator (2 lines)
    this.fgBgIndicator = new Text({
      parent: this.sidebar,
      top: 8,
      left: 0,
      width: 6,
      height: 2,
      content: this.getFGBGContent(),
      style: { bg: 'black' },
      tags: true,
    });

    // Tool buttons (below FG/BG)
    this.toolPanel = new Box({
      parent: this.sidebar,
      top: 10,
      left: 0,
      width: 6,
      height: 8,
      tags: true,
    });

    const tools: { label: string; tool: DrawingTool }[] = [
      { label: '{yellow-fg}T{/}ext', tool: 'text' },
      { label: '{yellow-fg}D{/}raw', tool: 'draw' },
      { label: '{yellow-fg}L{/}ine', tool: 'line' },
      { label: '{yellow-fg}R{/}ect', tool: 'box' },
      { label: '{yellow-fg}E{/}llip', tool: 'ellipse' },
      { label: '{yellow-fg}F{/}ill', tool: 'fill' },
      { label: '{yellow-fg}P{/}ick', tool: 'pick' },
      { label: '{yellow-fg}S{/}el', tool: 'select' },
    ];

    tools.forEach((t, idx) => {
      const isSelected = this.currentTool === t.tool;
      const toolBtn = new Box({
        parent: this.toolPanel,
        top: idx,
        left: 0,
        width: 6,
        height: 1,
        content: (isSelected ? '{inverse}' : '') + t.label + (isSelected ? '{/inverse}' : ''),
        style: { bg: 'black', fg: 'white', hover: { bg: 'blue' } },
        tags: true,
        mouse: true,
        clickable: true,
      });
      toolBtn.on('click', () => {
        this.switchTool(t.tool);
        this.updateSidebarToolSelection();
      });
    });

    // Brush mode panel (below tools)
    this.createBrushModePanel();
  }

  /**
   * FG/BG indicator reference
   */
  private fgBgIndicator?: Text;

  /**
   * Get FG/BG content string
   */
  private getFGBGContent(): string {
    const colors = [
      'black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white',
      'gray', 'lightred', 'lightgreen', 'lightyellow', 'lightblue', 'lightmagenta', 'lightcyan', 'lightwhite',
    ];
    const fgColor = colors[this.currentFg] || 'white';
    const bgColor = colors[this.currentBg] || 'black';
    return `{${fgColor}-fg}F{/}{${bgColor}-bg}B{/}${this.currentFg}/${this.currentBg}`;
  }

  /**
   * Update FG/BG indicator in sidebar
   */
  private updateSidebarFGBG(): void {
    if (this.fgBgIndicator) {
      this.fgBgIndicator.setContent(this.getFGBGContent());
    }
  }

  /**
   * Create brush mode panel in sidebar (compact)
   */
  private createBrushModePanel(): void {
    if (!this.sidebar) return;

    // Separator line
    new Text({
      parent: this.sidebar,
      top: 11,
      left: 0,
      content: '{gray-fg}------{/}',
      tags: true,
    });

    // Brush mode header + toggle button (compact single line)
    const brushModeBtn = new Box({
      parent: this.sidebar,
      top: 12,
      left: 0,
      width: 6,
      height: 1,
      content: this.getBrushModeContent(),
      style: { bg: 'black', fg: 'cyan', hover: { bg: 'blue' } },
      tags: true,
      mouse: true,
      clickable: true,
    });
    brushModeBtn.on('click', () => {
      // Cycle through brush modes
      if (this.brushMode === 'text') {
        this.switchBrushMode('half-block');
      } else {
        this.switchBrushMode('text');
      }
      brushModeBtn.setContent(this.getBrushModeContent());
      if (this.halfBlockBtn) {
        this.halfBlockBtn.setContent(this.getHalfBlockContent());
      }
      this.screen?.render();
    });

    // Half-block sub-row toggle (only relevant in half-block mode)
    this.halfBlockBtn = new Box({
      parent: this.sidebar,
      top: 13,
      left: 0,
      width: 6,
      height: 1,
      content: this.getHalfBlockContent(),
      style: { bg: 'black', fg: 'yellow', hover: { bg: 'blue' } },
      tags: true,
      mouse: true,
      clickable: true,
    });
    this.halfBlockBtn.on('click', () => {
      if (this.brushMode === 'half-block') {
        this.toggleHalfBlockSubY();
        this.halfBlockBtn!.setContent(this.getHalfBlockContent());
        this.screen?.render();
      }
    });
  }

  private halfBlockBtn?: Box;

  private getBrushModeContent(): string {
    if (this.brushMode === 'half-block') {
      return '{cyan-fg}{inverse}HlfBlk{/inverse}{/}';
    }
    return '{cyan-fg}HlfBlk{/}';
  }

  private getHalfBlockContent(): string {
    if (this.brushMode === 'half-block') {
      return `{yellow-fg}${this.halfBlockSubY === 0 ? '▀Up' : '▄Dn'}{/}`;
    }
    return '';
  }

  /**
   * Create layer panel in sidebar
   */
  private createLayerPanel(): void {
    if (!this.sidebar) return;

    // Layer panel header (positioned below brush mode panel)
    new Text({
      parent: this.sidebar,
      top: 25,
      left: 0,
      width: 6,
      height: 1,
      content: '{cyan-fg}Layers{/}',
      style: { bg: 'black' },
      tags: true,
    });

    // Layer list container
    this.layerPanel = new Box({
      parent: this.sidebar,
      top: 26,
      left: 0,
      width: 6,
      height: 4,
      style: { bg: 'black' },
      tags: true,
    });

    // Layer action buttons row
    const layerActions = new Box({
      parent: this.sidebar,
      top: 30,
      left: 0,
      width: 6,
      height: 1,
      style: { bg: 'black' },
      tags: true,
    });

    // Add layer button
    const addBtn = new Box({
      parent: layerActions,
      top: 0,
      left: 0,
      width: 2,
      height: 1,
      content: '{green-fg}+{/}',
      style: { bg: 'black', hover: { bg: 'blue' } },
      tags: true,
      mouse: true,
      clickable: true,
    });
    addBtn.on('click', () => this.addLayer());

    // Delete layer button
    const delBtn = new Box({
      parent: layerActions,
      top: 0,
      left: 2,
      width: 2,
      height: 1,
      content: '{red-fg}-{/}',
      style: { bg: 'black', hover: { bg: 'blue' } },
      tags: true,
      mouse: true,
      clickable: true,
    });
    delBtn.on('click', () => this.deleteLayer());

    // Merge down button
    const mergeBtn = new Box({
      parent: layerActions,
      top: 0,
      left: 4,
      width: 3,
      height: 1,
      content: '{yellow-fg}M{/}',
      style: { bg: 'black', hover: { bg: 'blue' } },
      tags: true,
      mouse: true,
      clickable: true,
    });
    mergeBtn.on('click', () => this.mergeLayerDown());

    this.updateLayerPanel();
  }

  /**
   * Update layer panel display
   */
  private updateLayerPanel(): void {
    if (!this.layerPanel) return;

    // Clear existing children
    while (this.layerPanel.children.length > 0) {
      const child = this.layerPanel.children[0];
      child.destroy();
    }

    // Display layers (top layer first)
    const visibleLayers = this.layers.slice().reverse().slice(0, 5);
    visibleLayers.forEach((layer, displayIdx) => {
      const actualIdx = this.layers.length - 1 - displayIdx;
      const isActive = actualIdx === this.activeLayerIndex;
      const visIcon = layer.visible ? '{white-fg}*{/}' : '{gray-fg}.{/}';
      const lockIcon = layer.locked ? '{red-fg}L{/}' : ' ';

      const layerRow = new Box({
        parent: this.layerPanel,
        top: displayIdx,
        left: 0,
        width: 6,
        height: 1,
        content: (isActive ? '{inverse}' : '') + `${visIcon}${lockIcon}${layer.name.slice(0, 4)}` + (isActive ? '{/inverse}' : ''),
        style: { bg: 'black', fg: 'white', hover: { bg: 'blue' } },
        tags: true,
        mouse: true,
        clickable: true,
      });

      layerRow.on('click', (data: any) => {
        if (data.button === 'left') {
          this.activeLayerIndex = actualIdx;
          this.adoptCellCanvas(this.layers[actualIdx].canvas);
          this.updateLayerPanel();
          this.updateDisplay();
        } else if (data.button === 'right') {
          // Toggle visibility
          this.layers[actualIdx].visible = !this.layers[actualIdx].visible;
          this.updateLayerPanel();
          this.composeLayers();
          this.updateDisplay();
        }
      });
    });

    this.screen?.render();
  }

  /**
   * Add new layer
   */
  private addLayer(): void {
    const newLayer: Layer = {
      id: this.nextLayerId++,
      name: `Layer ${this.nextLayerId - 1}`,
      canvas: CoreCanvas.createCanvas(this.canvasW, this.canvasH),
      visible: true,
      locked: false,
      opacity: 100,
    };

    // Insert above current layer
    this.layers.splice(this.activeLayerIndex + 1, 0, newLayer);
    this.activeLayerIndex++;
    this.adoptCellCanvas(newLayer.canvas);

    this.updateLayerPanel();
    this.updateDisplay();
    this.modified = true;
  }

  /**
   * Delete current layer
   */
  private deleteLayer(): void {
    if (this.layers.length <= 1) return;  // Can't delete last layer

    this.layers.splice(this.activeLayerIndex, 1);

    // Adjust active index
    if (this.activeLayerIndex >= this.layers.length) {
      this.activeLayerIndex = this.layers.length - 1;
    }

    this.adoptCellCanvas(this.layers[this.activeLayerIndex].canvas);

    this.composeLayers();
    this.updateLayerPanel();
    this.updateDisplay();
    this.modified = true;
  }

  /**
   * Merge current layer down into layer below
   */
  private mergeLayerDown(): void {
    if (this.activeLayerIndex === 0) return;  // Can't merge bottom layer

    const srcLayer = this.layers[this.activeLayerIndex];
    const dstLayer = this.layers[this.activeLayerIndex - 1];

    // Merge canvases (overlay src on dst)
    for (let y = 0; y < srcLayer.canvas.length; y++) {
      for (let x = 0; x < srcLayer.canvas[y].length; x++) {
        const srcCell = srcLayer.canvas[y][x];
        if (!CoreCanvas.isCellEmpty(srcCell)) {
          dstLayer.canvas[y][x] = { ...srcCell };
        }
      }
    }

    // Remove source layer
    this.layers.splice(this.activeLayerIndex, 1);
    this.activeLayerIndex--;
    this.adoptCellCanvas(dstLayer.canvas);

    this.composeLayers();
    this.updateLayerPanel();
    this.updateDisplay();
    this.modified = true;
  }

  /**
   * Toggle layer visibility
   */
  private toggleLayerVisibility(layerIndex?: number): void {
    const idx = layerIndex ?? this.activeLayerIndex;
    if (idx >= 0 && idx < this.layers.length) {
      this.layers[idx].visible = !this.layers[idx].visible;
      this.composeLayers();
      this.updateLayerPanel();
      this.updateDisplay();
    }
  }

  /**
   * Toggle layer lock
   */
  private toggleLayerLock(layerIndex?: number): void {
    const idx = layerIndex ?? this.activeLayerIndex;
    if (idx >= 0 && idx < this.layers.length) {
      this.layers[idx].locked = !this.layers[idx].locked;
      this.updateLayerPanel();
    }
  }

  /**
   * Compose all visible layers into a single output canvas
   */
  private composeLayers(): Cell[][] {
    const width = this.canvasW;
    const height = this.canvasH;
    const output = CoreCanvas.createCanvas(width, height);

    // Composite from bottom to top
    for (const layer of this.layers) {
      if (!layer.visible) continue;

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const cell = layer.canvas[y]?.[x];
          if (cell && !CoreCanvas.isCellEmpty(cell)) {
            output[y][x] = { ...cell };
          }
        }
      }
    }

    return output;
  }

  /**
   * Flatten all layers into one
   */
  private flattenLayers(): void {
    if (this.layers.length <= 1) return;

    const flattened = this.composeLayers();

    // Replace all layers with single flattened layer
    this.layers = [{
      id: this.nextLayerId++,
      name: 'Flattened',
      canvas: flattened,
      visible: true,
      locked: false,
      opacity: 100,
    }];
    this.activeLayerIndex = 0;
    this.adoptCellCanvas(flattened);

    this.updateLayerPanel();
    this.updateDisplay();
    this.modified = true;
  }

  /**
   * Move current layer up (toward front)
   */
  private moveLayerUp(): void {
    if (this.activeLayerIndex >= this.layers.length - 1) return;

    const temp = this.layers[this.activeLayerIndex];
    this.layers[this.activeLayerIndex] = this.layers[this.activeLayerIndex + 1];
    this.layers[this.activeLayerIndex + 1] = temp;
    this.activeLayerIndex++;

    this.composeLayers();
    this.updateLayerPanel();
    this.updateDisplay();
    this.modified = true;
  }

  /**
   * Move current layer down (toward back)
   */
  private moveLayerDown(): void {
    if (this.activeLayerIndex <= 0) return;

    const temp = this.layers[this.activeLayerIndex];
    this.layers[this.activeLayerIndex] = this.layers[this.activeLayerIndex - 1];
    this.layers[this.activeLayerIndex - 1] = temp;
    this.activeLayerIndex--;

    this.composeLayers();
    this.updateLayerPanel();
    this.updateDisplay();
    this.modified = true;
  }

  /**
   * Toggle iCE Colors mode (16 BG colors vs 8 + blink)
   */
  private toggleIceColors(): void {
    this.iceColorsEnabled = !this.iceColorsEnabled;
    this.updateStatusBar();

    // Update the Colors menu checkbox
    if (this.colorsMenu) {
      // The menu will reflect the state when reopened
    }

    this.screen?.render();
  }

  // ============================================
  // CLIPBOARD OPERATIONS
  // ============================================

  /**
   * Cut selection to clipboard. Undoable (fix-round-2, riding along with
   * moveBlock()'s fix - same class of bug, identical treatment): an
   * explicit snapshotUndoState() before mutating this.cellCanvas in place,
   * since there is no dedicated ToolHandler for a cut.
   */
  private cutSelection(): void {
    if (!this.cellCanvas || !this.coreState) return;

    // If no selection, select entire canvas
    const sel = this.selection || this.fullCanvasSelection();

    // Copy to clipboard
    this.copyRegion(sel.x1, sel.y1, sel.x2, sel.y2);

    this.syncToCoreState();
    snapshotUndoState(this.coreState);

    // Clear the region
    for (let y = sel.y1; y <= sel.y2; y++) {
      for (let x = sel.x1; x <= sel.x2; x++) {
        if (this.cellCanvas[y]?.[x]) {
          this.cellCanvas[y][x] = { char: ' ', fg: 7, bg: 0 };
        }
      }
    }

    this.syncCoreCanvasToDisplay();
    this.modified = true;
    this.updateDisplay();
  }

  /**
   * Copy selection to clipboard
   */
  private copySelection(): void {
    // If no selection, select entire canvas
    const sel = this.selection || this.fullCanvasSelection();
    this.copyRegion(sel.x1, sel.y1, sel.x2, sel.y2);
  }

  /**
   * Copy a region to clipboard
   */
  private copyRegion(x1: number, y1: number, x2: number, y2: number): void {
    if (!this.cellCanvas) return;

    const width = x2 - x1 + 1;
    const height = y2 - y1 + 1;

    this.clipboard = [];
    for (let y = 0; y < height; y++) {
      this.clipboard[y] = [];
      for (let x = 0; x < width; x++) {
        const srcCell = this.cellCanvas[y1 + y]?.[x1 + x];
        this.clipboard[y][x] = srcCell
          ? { ...srcCell }
          : { char: ' ', fg: 7, bg: 0 };
      }
    }
  }

  /**
   * Paste clipboard at cursor position. Routed through the library's
   * pasteSelection() - which does saveUndoState() for you - instead of
   * mutating this.cellCanvas by hand, so a paste is undoable (see
   * IMPORTANT 2, final-fix-wave-report.md): before this, Ctrl+Z after a
   * paste would pop the snapshot from before whatever stroke preceded it,
   * silently discarding both the paste and that stroke in one keypress.
   */
  private pasteClipboard(): void {
    if (!this.cellCanvas || !this.clipboard || !this.coreState) return;

    this.syncToCoreState();
    pasteSelection(this.coreState, this.cursor.col, this.cursor.line, this.clipboard);
    this.syncFromCoreState();
    this.updateDisplay();
  }

  // ============================================
  // ROW OPERATIONS
  // ============================================

  /**
   * Insert a blank row at cursor position. Undoable (IMPORTANT 2): an
   * explicit snapshotUndoState() before mutating this.cellCanvas in place,
   * since there is no dedicated ToolHandler for a row insert.
   */
  private insertRow(): void {
    if (!this.cellCanvas || !this.coreState) return;

    this.syncToCoreState();
    snapshotUndoState(this.coreState);

    const y = this.cursor.line;

    // Shift rows down (lose bottom row)
    for (let row = this.canvasH - 1; row > y; row--) {
      this.cellCanvas[row] = this.cellCanvas[row - 1];
    }

    // Create blank row
    this.cellCanvas[y] = [];
    for (let x = 0; x < this.canvasW; x++) {
      this.cellCanvas[y][x] = { char: ' ', fg: 7, bg: 0 };
    }

    this.syncCoreCanvasToDisplay();
    this.modified = true;
    this.updateDisplay();
  }

  /**
   * Delete row at cursor position. Undoable (IMPORTANT 2): an explicit
   * snapshotUndoState() before mutating this.cellCanvas in place, since
   * there is no dedicated ToolHandler for a row delete.
   */
  private deleteRow(): void {
    if (!this.cellCanvas || !this.coreState) return;

    this.syncToCoreState();
    snapshotUndoState(this.coreState);

    const y = this.cursor.line;

    // Shift rows up
    for (let row = y; row < this.canvasH - 1; row++) {
      this.cellCanvas[row] = this.cellCanvas[row + 1];
    }

    // Create blank row at bottom
    this.cellCanvas[this.canvasH - 1] = [];
    for (let x = 0; x < this.canvasW; x++) {
      this.cellCanvas[this.canvasH - 1][x] = { char: ' ', fg: 7, bg: 0 };
    }

    this.syncCoreCanvasToDisplay();
    this.modified = true;
    this.updateDisplay();
  }

  // ============================================
  // SELECTION OPERATIONS
  // ============================================

  /**
   * Select entire canvas
   */
  private selectAll(): void {
    this.selection = this.fullCanvasSelection();
    this.updateDisplay();
  }

  /**
   * Clear selection
   */
  private deselect(): void {
    this.selection = null;
    this.updateDisplay();
  }

  // ============================================
  // BLOCK OPERATIONS
  // ============================================

  /**
   * Move selected block to cursor position. Undoable as ONE logical action
   * (fix-round-2, final-fix-wave-report.md): a single snapshotUndoState()
   * before the clear, so one Ctrl+Z restores the pre-move canvas (source
   * content back, destination empty) in one step. Deliberately does NOT
   * route the paste half through pasteClipboard()/pasteSelection() - that
   * pushes its OWN undo entry, which would snapshot the already-cleared
   * canvas and split this one move into two undo steps: a Ctrl+Z would then
   * leave the source blank and the paste gone, a state the user never
   * created (redo recovers it, but nothing on screen says redo is what you
   * need). CoreCanvas.pasteCanvas() is the same primitive pasteSelection()
   * calls internally, minus its saveUndoState() call.
   */
  private moveBlock(): void {
    if (!this.selection || !this.cellCanvas || !this.coreState) return;

    const sel = this.selection;

    // Copy to clipboard first
    this.copyRegion(sel.x1, sel.y1, sel.x2, sel.y2);

    this.syncToCoreState();
    snapshotUndoState(this.coreState);

    // Clear original location
    for (let y = sel.y1; y <= sel.y2; y++) {
      for (let x = sel.x1; x <= sel.x2; x++) {
        if (this.cellCanvas[y]?.[x]) {
          this.cellCanvas[y][x] = { char: ' ', fg: 7, bg: 0 };
        }
      }
    }

    // Paste at cursor - same canvas reference coreState is already pointed
    // at, mutated in place, no second undo entry.
    if (this.clipboard) {
      CoreCanvas.pasteCanvas(this.cellCanvas, this.clipboard, this.cursor.col, this.cursor.line);
    }

    this.syncFromCoreState();

    this.selection = null;
    this.modified = true;
    this.updateDisplay();
  }

  /**
   * Copy selected block to cursor position
   */
  private copyBlock(): void {
    if (!this.selection) return;

    const sel = this.selection;

    // Copy to clipboard
    this.copyRegion(sel.x1, sel.y1, sel.x2, sel.y2);

    // Paste at cursor (don't clear original)
    this.pasteClipboard();

    this.selection = null;
    this.modified = true;
    this.updateDisplay();
  }

  // ============================================
  // FLIP OPERATIONS
  // ============================================

  /**
   * Flip selection or canvas horizontally. Undoable (IMPORTANT 2): an
   * explicit snapshotUndoState() before mutating this.cellCanvas in place,
   * since there is no dedicated ToolHandler for a flip.
   */
  private flipHorizontal(): void {
    if (!this.cellCanvas || !this.coreState) return;

    this.syncToCoreState();
    snapshotUndoState(this.coreState);

    const sel = this.selection || this.fullCanvasSelection();
    const width = sel.x2 - sel.x1 + 1;

    for (let y = sel.y1; y <= sel.y2; y++) {
      const row = this.cellCanvas[y];
      if (!row) continue;

      // Swap cells from left to right
      for (let x = 0; x < Math.floor(width / 2); x++) {
        const leftX = sel.x1 + x;
        const rightX = sel.x2 - x;
        const temp = row[leftX];
        row[leftX] = row[rightX];
        row[rightX] = temp;
      }
    }

    this.syncCoreCanvasToDisplay();
    this.modified = true;
    this.updateDisplay();
  }

  /**
   * Flip selection or canvas vertically. Undoable (IMPORTANT 2): an
   * explicit snapshotUndoState() before mutating this.cellCanvas in place,
   * since there is no dedicated ToolHandler for a flip.
   */
  private flipVertical(): void {
    if (!this.cellCanvas || !this.coreState) return;

    this.syncToCoreState();
    snapshotUndoState(this.coreState);

    const sel = this.selection || this.fullCanvasSelection();
    const height = sel.y2 - sel.y1 + 1;

    for (let y = 0; y < Math.floor(height / 2); y++) {
      const topY = sel.y1 + y;
      const bottomY = sel.y2 - y;

      // Swap entire rows within selection bounds
      for (let x = sel.x1; x <= sel.x2; x++) {
        const temp = this.cellCanvas[topY][x];
        this.cellCanvas[topY][x] = this.cellCanvas[bottomY][x];
        this.cellCanvas[bottomY][x] = temp;
      }
    }

    this.syncCoreCanvasToDisplay();
    this.modified = true;
    this.updateDisplay();
  }

  // ============================================
  // ABOUT DIALOG
  // ============================================

  /**
   * Show About dialog
   */
  private showAbout(): void {
    if (!this.screen || this.modalOpen) return;

    this.drawCursor.hide();
    this.modalOpen = true;

    const aboutText = `{cyan-fg}{bold}ANSI EDITOR{/bold}{/cyan-fg}
{gray-fg}Version 2.0{/gray-fg}

{white-fg}A Moebius-style ANSI art editor for
the AmiExpress BBS system.{/white-fg}

{yellow-fg}{bold}Features:{/bold}{/yellow-fg}
  - Full 16-color ANSI palette
  - Multiple drawing tools
  - Layer support
  - iCE colors mode
  - SAUCE metadata
  - Undo/Redo

{yellow-fg}{bold}Inspired by:{/bold}{/yellow-fg}
  - Moebius (Andy Herbert)
  - TheDraw
  - ACiDDraw
  - PabloDraw

{gray-fg}Part of AmiExpress-Web
BBS Door SDK v2.0{/gray-fg}

{cyan-fg}Press any key to close{/cyan-fg}`;

    const aboutModal = new DocModal({
      parent: this.screen,
      title: 'About ANSI Editor',
      content: aboutText,
      closeKeys: ['escape', 'q', 'enter', 'space'],
      footerText: '{bold} Press any key to close {/bold}',
      style: {
        fg: 'white',
        bg: 'blue',
        border: { fg: 'cyan' },
      },
      contentStyle: {
        fg: 'white',
        bg: 'blue',
      },
      onClose: () => {
        aboutModal.destroy();
        this.restoreFocusAfterDialog();
      },
    });

    const focusTarget = this.mode === 'draw' ? this.drawCanvas : this.viewport;
    aboutModal.display(focusTarget);
  }

  /**
   * Ask for one line of text, in the editor's own style.
   *
   * Modelled on the SAUCE dialog's field editor, which was the only text
   * input this widget had and was welded inside it.
   */
  private promptForText(title: string, initial = ''): Promise<string | null> {
    return new Promise((resolve) => {
      if (!this.screen) { resolve(null); return; }

      const box = new Box({
        parent: this.screen,
        top: 'center', left: 'center',
        width: 44, height: 5,
        border: { type: 'line' },
        label: ` ${title} `,
        tags: true, keys: true, focusable: true,
        style: { bg: 'black', fg: 'white', border: { fg: 'yellow' } },
      });
      const line = new Text({
        parent: box, top: 1, left: 2, width: 38, tags: true, content: '',
      });
      const hint = new Text({
        parent: box, bottom: 0, left: 2, tags: true,
        content: '{gray-fg}Enter: accept   ESC: cancel{/gray-fg}',
      });

      let value = initial;
      const paint = () => {
        line.setContent(`{inverse}${value.padEnd(34)}{/inverse}`);
        this.screen?.render();
      };
      paint();

      const finish = (answer: string | null) => {
        box.removeListener('keypress', onKey);
        hint.destroy();
        box.destroy();
        this.restoreFocusAfterDialog();
        resolve(answer);
      };

      const onKey = (_ch: string, key: any) => {
        if (key?.name === 'escape') { finish(null); return; }
        if (key?.name === 'enter') { finish(value.trim()); return; }
        if (key?.name === 'backspace') { value = value.slice(0, -1); paint(); return; }
        const ch = key?.ch ?? _ch;
        if (ch && ch.length === 1 && !key?.ctrl && !key?.meta && value.length < 34) {
          value += ch;
          paint();
        }
      };

      this.modalOpen = true;
      box.on('keypress', onKey);
      this.takeModalFocus(box);
      this.screen.render();
    });
  }

  /** A one-line notice that goes away on any key. */
  private showMessage(title: string, text: string, colour: string = 'cyan'): void {
    if (!this.screen) return;
    const box = new Box({
      parent: this.screen,
      top: 'center', left: 'center',
      width: Math.max(24, text.length + 6), height: 5,
      border: { type: 'line' },
      label: ` ${title} `,
      content: text,
      padding: { left: 2, right: 2, top: 1, bottom: 1 },
      tags: true, keys: true, focusable: true,
      style: { bg: 'black', fg: 'white', border: { fg: colour } },
    });
    const close = () => {
      box.destroy();
      this.restoreFocusAfterDialog();
    };
    this.modalOpen = true;
    box.key(['escape', 'enter', 'space', 'q'], close);
    this.takeModalFocus(box);
    this.screen.render();
  }

  /**
   * Grow or crop the canvas, keeping the artwork that still fits.
   *
   * There was no way to change the size of a document once it was open -
   * "there seem be no way to change canvas size for loaded projects"
   * (2026-09-02) - so a canvas was whatever it happened to be created as.
   * Cells outside the new bounds are dropped, new ones start empty, and
   * every layer is resized with it or the stack would go ragged.
   */
  resizeCanvas(width: number, height: number): void {
    const w = Math.max(1, Math.floor(width));
    const h = Math.max(1, Math.floor(height));
    if (!this.cellCanvas) return;
    if (w === this.canvasW && h === this.canvasH) return;

    const resize = (canvas: Cell[][]): Cell[][] => {
      const next: Cell[][] = [];
      for (let y = 0; y < h; y++) {
        next[y] = [];
        for (let x = 0; x < w; x++) {
          next[y][x] = canvas[y]?.[x] ?? { char: ' ', fg: 7, bg: 0 };
        }
      }
      return next;
    };

    for (const layer of this.layers) {
      if (layer.canvas) layer.canvas = resize(layer.canvas);
    }
    this.adoptCellCanvas(this.layers[this.activeLayerIndex]?.canvas ?? resize(this.cellCanvas));

    this.optCanvasWidth = w;
    this.optCanvasHeight = h;
    this.cursor.line = Math.min(this.cursor.line, h - 1);
    this.cursor.col = Math.min(this.cursor.col, w - 1);
    this.selection = null;
    this.modified = true;

    // The canvas box is sized to the art and centred in the room it has, so
    // a resize is a re-layout, not just a bigger array.
    const topOffset = (this.menuBar ? 1 : 0) + (this.fkeyToolbar ? 1 : 0);
    const geom = this.centredCanvasGeometry(topOffset, this.sidebar ? 6 : 0, !!this.statusBar);
    this.drawCanvas.top = geom.top;
    this.drawCanvas.left = geom.left;
    this.drawCanvas.width = geom.width;
    this.drawCanvas.height = geom.height;

    this.syncCoreCanvasToDisplay();
    this.updateDisplay();
    this.screen?.render();
  }

  /**
   * Ask for a new canvas size.
   *
   * A host that owns the document answers this itself - a sprite has cells,
   * frames and animations, and resizing only the editor's canvas would
   * leave the door's document behind. Without such a host the widget asks
   * for WxH and resizes its own canvas.
   */
  private async changeCanvasSize(): Promise<void> {
    if (this.onResizeCallback) {
      await this.onResizeCallback();
      return;
    }
    const answer = await this.promptForText(
      'Canvas Size', `${this.canvasW}x${this.canvasH}`,
    );
    if (!answer) return;
    const match = /^\s*(\d+)\s*[xX*]\s*(\d+)\s*$/.exec(answer);
    if (!match) {
      this.showMessage('Canvas Size', 'Give it as WIDTHxHEIGHT, like 80x25.', 'yellow');
      return;
    }
    this.resizeCanvas(Number(match[1]), Number(match[2]));
  }

  /**
   * Show SAUCE metadata editor dialog
   */
  private showSauceEditor(): void {
    if (!this.screen || this.modalOpen) return;

    this.drawCursor.hide();
    this.modalOpen = true;

    // Create overlay for dimming background
    const overlay = new Overlay({
      parent: this.screen,
      opacity: 0.5,
    });

    // Modal dialog
    const modal = new Box({
      parent: overlay,
      top: 'center',
      left: 'center',
      width: 50,
      height: 18,
      border: { type: 'line' },
      label: ' SAUCE Information ',
      tags: true,
      keys: true,
      mouse: true,
      style: { fg: 'white', bg: 'blue', border: { fg: 'cyan' } },
    });

    // Current values
    let title = this.sauce.title;
    let author = this.sauce.author;
    let group = this.sauce.group;

    // Title field
    new Text({
      parent: modal,
      top: 1,
      left: 2,
      content: '{cyan-fg}Title:{/}',
      tags: true,
    });
    const titleBox = new Box({
      parent: modal,
      top: 1,
      left: 10,
      width: 35,
      height: 1,
      content: title,
      style: { bg: 'black', fg: 'white' },
      tags: true,
    });

    // Author field
    new Text({
      parent: modal,
      top: 3,
      left: 2,
      content: '{cyan-fg}Author:{/}',
      tags: true,
    });
    const authorBox = new Box({
      parent: modal,
      top: 3,
      left: 10,
      width: 35,
      height: 1,
      content: author,
      style: { bg: 'black', fg: 'white' },
      tags: true,
    });

    // Group field
    new Text({
      parent: modal,
      top: 5,
      left: 2,
      content: '{cyan-fg}Group:{/}',
      tags: true,
    });
    const groupBox = new Box({
      parent: modal,
      top: 5,
      left: 10,
      width: 35,
      height: 1,
      content: group,
      style: { bg: 'black', fg: 'white' },
      tags: true,
    });

    // Info (read-only)
    new Text({
      parent: modal,
      top: 7,
      left: 2,
      content: `{gray-fg}Date: ${this.sauce.date}{/}`,
      tags: true,
    });
    new Text({
      parent: modal,
      top: 8,
      left: 2,
      content: `{gray-fg}Size: ${this.canvasW}x${this.canvasH}{/}`,
      tags: true,
    });
    new Text({
      parent: modal,
      top: 9,
      left: 2,
      content: `{gray-fg}iCE: ${this.iceColorsEnabled ? 'Yes' : 'No'}{/}`,
      tags: true,
    });

    // Field navigation
    let activeField = 0;
    const fields = [titleBox, authorBox, groupBox];
    const values = [title, author, group];

    const updateFields = () => {
      fields.forEach((f, i) => {
        (f.style as any).bg = i === activeField ? 'cyan' : 'black';
        (f.style as any).fg = i === activeField ? 'black' : 'white';
      });
      this.screen?.render();
    };
    updateFields();

    // Instructions
    new Text({
      parent: modal,
      top: 11,
      left: 2,
      content: '{yellow-fg}Tab{/}: Next field  {yellow-fg}Enter{/}: Edit  {yellow-fg}ESC{/}: Close',
      tags: true,
    });

    const trapCleanup = trapModalInput(modal);

    const closeDialog = (save: boolean) => {
      trapCleanup();
      overlay.destroy();
      if (save) {
        this.sauce.title = values[0];
        this.sauce.author = values[1];
        this.sauce.group = values[2];
        this.modified = true;
      }
      this.restoreFocusAfterDialog();
    };

    modal.key(['tab'], () => {
      activeField = (activeField + 1) % fields.length;
      updateFields();
    });

    modal.key(['S-tab'], () => {
      activeField = (activeField - 1 + fields.length) % fields.length;
      updateFields();
    });

    modal.key(['enter'], () => {
      // Simple inline editing - just prompt
      const current = values[activeField];
      const fieldNames = ['Title', 'Author', 'Group'];

      // Create a simple prompt
      const promptBox = new Box({
        parent: modal,
        top: 13,
        left: 2,
        width: 44,
        height: 3,
        border: { type: 'line' },
        label: ` Edit ${fieldNames[activeField]} `,
        tags: true,
        style: { bg: 'black', fg: 'white', border: { fg: 'yellow' } },
      });

      const input = new Text({
        parent: promptBox,
        top: 0,
        left: 1,
        width: 40,
        content: `{inverse}${current.padEnd(35)}{/inverse}`,
        tags: true,
      });

      let editValue = current;
      let cursorPos = current.length;

      const updateInput = () => {
        const displayVal = editValue.padEnd(35);
        const before = displayVal.slice(0, cursorPos);
        const at = displayVal[cursorPos] || ' ';
        const after = displayVal.slice(cursorPos + 1);
        input.setContent(`${before}{inverse}${at}{/inverse}${after}`);
        this.screen?.render();
      };
      updateInput();

      const handleKey = (_ch: string, key: any) => {
        if (key.name === 'escape') {
          promptBox.destroy();
          modal.removeListener('keypress', handleKey);
          return;
        }
        if (key.name === 'enter') {
          values[activeField] = editValue.trim();
          fields[activeField].setContent(values[activeField]);
          promptBox.destroy();
          modal.removeListener('keypress', handleKey);
          return;
        }
        if (key.name === 'backspace') {
          if (cursorPos > 0) {
            editValue = editValue.slice(0, cursorPos - 1) + editValue.slice(cursorPos);
            cursorPos--;
            updateInput();
          }
          return;
        }
        if (key.name === 'left') {
          if (cursorPos > 0) cursorPos--;
          updateInput();
          return;
        }
        if (key.name === 'right') {
          if (cursorPos < editValue.length) cursorPos++;
          updateInput();
          return;
        }
        // Regular character input
        if (key.ch && !key.ctrl && !key.meta && editValue.length < 35) {
          editValue = editValue.slice(0, cursorPos) + key.ch + editValue.slice(cursorPos);
          cursorPos++;
          updateInput();
        }
      };

      modal.on('keypress', handleKey);
      this.screen?.render();
    });

    modal.key(['escape', 'q'], () => closeDialog(true));  // Auto-save on close
    overlay.on('cancel', () => closeDialog(false));

    overlay.show();
    this.takeModalFocus(modal);
    this.screen.render();
  }

  /**
   * Update sidebar tool selection highlighting
   */
  private updateSidebarToolSelection(): void {
    if (!this.toolPanel) return;

    const tools: DrawingTool[] = ['text', 'draw', 'line', 'box', 'ellipse', 'fill', 'pick', 'select'];
    const labels = ['Text', 'Draw', 'Line', 'Rect', 'Ellip', 'Fill', 'Pick', 'Select'];

    this.toolPanel.children.forEach((child, idx) => {
      if (child instanceof Box && idx < tools.length) {
        const isSelected = this.currentTool === tools[idx];
        const shortcut = labels[idx][0];
        const rest = labels[idx].slice(1);
        child.setContent((isSelected ? '{inverse}' : '') + `{yellow-fg}${shortcut}{/yellow-fg}${rest}` + (isSelected ? '{/inverse}' : ''));
      }
    });

    this.screen?.render();
  }

  /**
   * Toggle sidebar visibility
   */
  private toggleSidebar(): void {
    if (!this.sidebar) return;

    const showing = this.sidebar.hidden;
    if (showing) this.sidebar.show();
    else this.sidebar.hide();

    // The canvas is CENTRED in the room it has (centredCanvasGeometry), so
    // pinning it to the sidebar's edge threw the artwork against the left
    // border and left it there - "when i toggle sidebar the anim collapses
    // to the left border" (2026-09-02). Hiding the sidebar gives the canvas
    // six more columns of room; where it sits in that room is arithmetic,
    // not a constant.
    const sidebarWidth = showing ? 6 : 0;
    const topOffset = (this.menuBar ? 1 : 0) + (this.fkeyToolbar ? 1 : 0);
    this.viewport.left = sidebarWidth;

    const geom = this.centredCanvasGeometry(topOffset, sidebarWidth, !!this.statusBar);
    this.drawCanvas.top = geom.top;
    this.drawCanvas.left = geom.left;
    this.updateDrawCursor();
    this.screen?.render();
  }

  /**
   * Toggle F-key toolbar visibility
   */
  private toggleFkeyToolbar(): void {
    if (this.fkeyToolbar) {
      if (this.fkeyToolbar.hidden) {
        this.fkeyToolbar.show();
      } else {
        this.fkeyToolbar.hide();
      }
      this.screen?.render();
    }
  }

  /**
   * Swap foreground and background colors
   */
  private swapColors(): void {
    const tmp = this.currentFg;
    this.currentFg = this.currentBg;
    this.currentBg = tmp;
    this.updateStatusBar();
    this.screen?.render();
  }

  /**
   * Reset colors to default (white on black)
   */
  private resetColors(): void {
    this.currentFg = 7;
    this.currentBg = 0;
    this.updateStatusBar();
    this.screen?.render();
  }

  /**
   * Create new document (clear canvas)
   */
  private newDocument(): void {
    if (!this.cellCanvas) return;

    // Clear the canvas (preserves the editor's configured dimensions).
    // adoptCellCanvas() keeps the active layer's canvas reference in sync
    // (composeLayers/mergeLayerDown/flattenLayers all read layer.canvas
    // directly, not this.cellCanvas - without this a merge-down or
    // flatten-on-save after File > New would still emit the pre-clear
    // content) AND clears coreState's draw-mode undo history, so a stale
    // entry from before the clear can't resurrect the pre-clear canvas via
    // Ctrl+Z.
    this.adoptCellCanvas(this.createBlankCanvas(this.canvasW, this.canvasH));
    this.syncCoreCanvasToDisplay();

    // Reset lines for text mode
    this.lines = [''];
    this.cursor = { line: 0, col: 0 };
    this.modified = false;

    // Clear undo stack (text mode)
    this.undoStack = [];
    this.redoStack = [];
    this.saveUndoState();

    this.updateDisplay();
  }

  private setupKeyHandlers(): void {
    // Set up handlers on viewport (which has focus) instead of parent
    // This ensures input is actually received

    // Help (?) - works on both viewport and canvas
    this.viewport.key(['?'], () => {
      this.showHelp();
      return true;
    });
    this.drawCanvas.key(['?'], () => {
      this.showHelp();
      return true;
    });

    // Exit handler - shared function
    const handleExit = () => {
      // Don't exit if a modal is open - ESC should only close the modal
      if (this.modalOpen) return true;

      if (this.onExitCallback) {
        if (this.modified) {
          this.confirmExit();
        } else {
          this.onExitCallback();
        }
      }
      return true;
    };

    // ESC on parent, viewport, AND drawCanvas
    this.key(['escape'], handleExit);
    this.viewport.key(['escape'], handleExit);
    this.drawCanvas.key(['escape'], handleExit);

    // Toggle UI visibility (F2 by default)
    this.viewport.key([this.hideUIHotkey], () => {
      this.toggleUI();
      return true;
    });

    // Text mode keys - listen on viewport
    // Modifier key combinations (Ctrl+S, Ctrl+M, etc.) are handled here
    // because blessed's key() method is unreliable for Ctrl combinations
    this.viewport.on('keypress', (ch: string, key: any) => {
      if (!key) return;

      // Handle Ctrl+key shortcuts first
      if (key.ctrl) {
        if (key.name === 's') {
          this.save().catch(console.error);
          return;
        } else if (key.name === 'm') {
          this.toggleMode();
          return;
        } else if (key.name === 'z') {
          this.undo();
          return;
        } else if (key.name === 'y') {
          this.redo();
          return;
        }
      }

      this.handleTextKey(ch, key);
      this.updateDisplay();
    });

    // Draw mode keys - listen on canvas
    // Modifier key combinations are handled here as well
    this.drawCanvas.on('keypress', (ch: string, key: any) => {
      if (!key) return;

      // Handle Ctrl+key shortcuts first
      if (key.ctrl) {
        if (key.name === 's') {
          this.save().catch(console.error);
          return;
        } else if (key.name === 'm') {
          this.toggleMode();
          return;
        } else if (key.name === 'z') {
          this.undo();
          return;
        } else if (key.name === 'y') {
          this.redo();
          return;
        }
      }

      this.handleDrawKey(ch, key);
      this.updateStatusBar();
      if (this.screen) {
        this.screen.render();
      }
    });
  }

  private setupMouseHandlers(): void {
    // The wheel is reported from the WIDGET, not from the draw canvas.
    //
    // Zoom belongs to whatever hosts this editor - the widget has no zoom of
    // its own, only the scale it was built with - so it says which way the
    // wheel turned and over which cell, and lets the host decide.
    //
    // On the widget deliberately: since the canvas became centred it is only
    // as large as the ART, so a wheel turn over the surrounding space never
    // reached it. Reported as "i tried the scrollwheel in spriteed now it
    // didnt zoom" - the event was arriving, at a box the pointer was not
    // over. Listening here means anywhere in the editor works, and it fires
    // once rather than twice, which listening on both would have done.
    this.on('mouse', (data: any) => {
      if (!data || (data.action !== 'wheelup' && data.action !== 'wheeldown')) return;
      if (this.modalOpen) return;
      this.emit('canvas-wheel', {
        direction: data.action === 'wheelup' ? 'up' : 'down',
        col: this.screenToCanvasX(data.x - this.drawCanvas.ileft),
        line: this.screenToCanvasY(data.y - this.drawCanvas.itop),
      });
    });

    // TEXT MODE - Mouse click on viewport for cursor positioning
    this.viewport.on('click', (data: any) => {
      if (!data) return;

      // Calculate click position relative to viewport
      const x = data.x - this.viewport.aleft;
      const y = data.y - this.viewport.atop;

      if (x < 0 || y < 0) return;

      // Move cursor to clicked position - allow free movement
      this.cursor.line = y + this.scrollTop;
      this.cursor.col = x + this.scrollLeft;

      // Ensure lines exist up to cursor position
      while (this.lines.length <= this.cursor.line) {
        this.lines.push('');
      }

      // Pad line with spaces if cursor is beyond current line length
      const line = this.lines[this.cursor.line] || '';
      if (this.cursor.col > line.length) {
        this.lines[this.cursor.line] = line.padEnd(this.cursor.col, ' ');
      }

      this.updateDisplay();
      if (this.screen) {
        this.screen.render();
      }
    });

    // DRAW MODE - Mouse handlers on canvas
    this.drawCanvas.on('click', (data: any) => {
      // Don't process clicks if a modal dialog or dropdown menu is open (or just closed)
      if (!data || this.modalOpen || DropdownMenu.shouldBlockClick()) return;

      // Calculate click position relative to canvas content area
      // Use ileft/itop to account for any border or padding
      const x = data.x - this.drawCanvas.ileft;
      const y = data.y - this.drawCanvas.itop;

      if (x < 0 || y < 0) return;

      // Clamp to canvas bounds
      this.cursor.col = this.screenToCanvasX(x);
      this.cursor.line = this.screenToCanvasY(y);
      this.updateDrawCursor();

      // Handle tool-specific click behavior
      if (data.button === 'left') {
        this.handleToolClick(this.cursor.col, this.cursor.line);
      } else if (data.button === 'right') {
        // RMB: Draw with background color (Moebius-style)
        this.drawWithBackgroundColor();
      }

      this.updateStatusBar();
      if (this.screen) {
        this.screen.render();
      }
    });

    // DRAW MODE - Mouse movement for continuous drawing
    // Also handles mousedown since 'click' event may not fire reliably
    this.drawCanvas.on('mouse', (data: any) => {
      // Don't process mouse events if a modal dialog or dropdown menu is open (or just closed)
      if (!data || !data.action || this.modalOpen || DropdownMenu.shouldBlockClick()) return;

      // Calculate position relative to canvas content area
      // Use ileft/itop to account for any border or padding
      // Releasing the mouse ends a continuous freehand/half-block drag -
      // flush its chunked undo entry (see drawAtCursor()/paintCell()).
      // No-op if nothing was chunked (e.g. a shape tool or a plain click).
      //
      // BEFORE the bounds check, deliberately: a release outside the canvas
      // is still the end of the stroke. Flushing after the check meant a
      // mouseup over the sidebar, the menu bar or off the widget entirely
      // left the chunk open, so the NEXT stroke joined the previous one's
      // undo entry and one Ctrl+Z threw both away. Reported as "undo
      // behaves weird" while drawing a sprite.
      if (data.action === 'mouseup') {
        this.flushDrawChunk();
      }

      // Calculate position relative to canvas content area
      // Use ileft/itop to account for any border or padding
      const x = data.x - this.drawCanvas.ileft;
      const y = data.y - this.drawCanvas.itop;

      if (x < 0 || y < 0) return;

      // A wheel turn is not pointing: it must not move the drawing cursor
      // or paint. It is REPORTED from the widget-level handler below, not
      // here - see there for why.
      if (data.action === 'wheelup' || data.action === 'wheeldown') return;

      // Clamp to canvas bounds
      this.cursor.col = this.screenToCanvasX(x);
      this.cursor.line = this.screenToCanvasY(y);
      this.updateDrawCursor();

      // For shape tools, update preview on mouse move while drawing
      const shapeTools: DrawingTool[] = ['line', 'box', 'box-fill', 'ellipse', 'ellipse-fill', 'select'];
      const isShapeTool = shapeTools.includes(this.currentTool);

      if (isShapeTool && this.isDrawing && data.action === 'mousemove') {
        // Update shape preview
        this.updateShapePreview(this.cursor.col, this.cursor.line);
      } else if (!isShapeTool) {
        // Draw/text tools - draw on mousedown or mousemove with button pressed (drag)
        // LMB: Draw with foreground color, RMB: Draw with background color (Moebius-style)
        if ((data.action === 'mousedown' || data.action === 'mousemove') && data.button) {
          if (data.button === 'left') {
            // Use half-block mode if enabled
            if (this.brushMode === 'half-block') {
              this.drawHalfBlock(this.cursor.col, this.cursor.line, this.halfBlockSubY);
            } else {
              this.drawAtCursor();
            }
          } else if (data.button === 'right') {
            // RMB: Draw with background color (Moebius-style)
            if (this.brushMode === 'half-block') {
              this.drawHalfBlockWithBg(this.cursor.col, this.cursor.line, this.halfBlockSubY);
            } else {
              this.drawWithBackgroundColor();
            }
          }
        }
      }

      this.updateStatusBar();
      if (this.screen) {
        this.screen.render();
      }
    });
  }

  private toggleUI(): void {
    this.uiVisible = !this.uiVisible;

    // Toggle all UI components
    if (this.menuBar) {
      if (this.uiVisible) this.menuBar.show();
      else this.menuBar.hide();
    }

    if (this.fkeyToolbar) {
      if (this.uiVisible) this.fkeyToolbar.show();
      else this.fkeyToolbar.hide();
    }

    if (this.sidebar) {
      if (this.uiVisible) this.sidebar.show();
      else this.sidebar.hide();
    }

    if (this.statusBar) {
      if (this.uiVisible) this.statusBar.show();
      else this.statusBar.hide();
    }

    // Calculate new layout positions
    let topOffset = 0;
    let leftOffset = 0;

    if (this.uiVisible) {
      if (this.menuBar) topOffset += 1;
      if (this.fkeyToolbar) topOffset += 1;
      if (this.sidebar) leftOffset = 6;
    }

    // Adjust viewport/canvas positions
    this.viewport.top = topOffset;
    this.viewport.left = leftOffset;
    this.viewport.bottom = this.uiVisible && this.statusBar ? 1 : 0;

    this.drawCanvas.top = topOffset;
    this.drawCanvas.left = leftOffset;
    this.drawCanvas.bottom = this.uiVisible && this.statusBar ? 1 : 0;

    this.drawCursor.top = topOffset;
    this.drawCursor.left = leftOffset;

    this.updateDrawCursor();
    this.updateDisplay();
    if (this.screen) {
      this.screen.render();
    }
  }

  private handleTextKey(ch: string, key: any): void {
    const { name, ctrl, shift } = key;

    // Navigation
    if (name === 'left') {
      this.moveCursor(-1, 0);
    } else if (name === 'right') {
      this.moveCursor(1, 0);
    } else if (name === 'up') {
      this.moveCursor(0, -1);
    } else if (name === 'down') {
      this.moveCursor(0, 1);
    } else if (name === 'home') {
      this.cursor.col = 0;
    } else if (name === 'end') {
      this.cursor.col = this.lines[this.cursor.line]?.length || 0;
    } else if (name === 'pageup') {
      const viewportHeight = this.viewport.height as number - 2;
      this.cursor.line = Math.max(0, this.cursor.line - viewportHeight);
    } else if (name === 'pagedown') {
      const viewportHeight = this.viewport.height as number - 2;
      this.cursor.line = Math.min(this.lines.length - 1, this.cursor.line + viewportHeight);
    }

    // Editing
    else if (name === 'return' || name === 'enter') {
      this.insertNewLine();
    } else if (name === 'backspace') {
      this.deleteChar(true);
    } else if (name === 'delete') {
      this.deleteChar(false);
    } else if (name === 'tab') {
      this.overwriteTextAtCursor('  '); // 2 spaces
    } else if (ch && ch.length === 1 && !ctrl) {
      this.overwriteTextAtCursor(ch);
    }

    // Delete line
    else if (ctrl && name === 'd') {
      this.lines.splice(this.cursor.line, 1);
      if (this.lines.length === 0) this.lines = [''];
      this.modified = true;
    }
  }

  private handleDrawKey(ch: string, key: any): void {
    const { name, shift, ctrl } = key;

    // ===== F-KEYS: Select character from F-key toolbar (Moebius-style) =====
    // F1-F12 now select characters from the current character set
    const fkeyMatch = name?.match(/^f(\d+)$/);
    if (fkeyMatch) {
      const fkeyNum = parseInt(fkeyMatch[1], 10);
      if (fkeyNum >= 1 && fkeyNum <= 12) {
        // Shift+F-key to change character set
        if (shift) {
          this.nextFkeySet();
        } else {
          this.selectFkeyChar(fkeyNum - 1);
        }
        return;
      }
    }

    // ===== ALT KEY SHORTCUTS =====
    if (key.meta || key.alt) {
      // Alt+C = Colors (FG picker)
      if (name === 'c') {
        this.showColorPicker(true);
        return;
      }
      // Alt+B = Background color picker
      if (name === 'b') {
        this.showColorPicker(false);
        return;
      }
      // Alt+H = Toggle half-block mode
      if (name === 'h') {
        if (this.brushMode === 'half-block') {
          this.switchBrushMode('text');
        } else {
          this.switchBrushMode('half-block');
        }
        return;
      }
    }

    // ===== CTRL KEY SHORTCUTS =====
    if (ctrl) {
      // Ctrl+H = Toggle half-block sub-row (upper/lower)
      if (name === 'h') {
        this.toggleHalfBlockSubY();
        return;
      }
    }

    // ===== TAB = Toggle half-block sub-row when in half-block mode =====
    if (name === 'tab' && this.brushMode === 'half-block') {
      this.toggleHalfBlockSubY();
      return;
    }

    // ===== NAVIGATION: Always works =====
    if (name === 'left') {
      this.cursor.col = Math.max(0, this.cursor.col - 1);
      this.updateDrawCursor();
      return;
    }
    if (name === 'right') {
      this.cursor.col = this.clampCol(this.cursor.col + 1);
      this.updateDrawCursor();
      return;
    }
    if (name === 'up') {
      this.cursor.line = Math.max(0, this.cursor.line - 1);
      this.updateDrawCursor();
      return;
    }
    if (name === 'down') {
      this.cursor.line = this.clampLine(this.cursor.line + 1);
      this.updateDrawCursor();
      return;
    }

    // Enter moves to next line
    if (name === 'enter' || name === 'return') {
      this.cursor.line = this.clampLine(this.cursor.line + 1);
      this.cursor.col = 0;
      this.updateDrawCursor();
      return;
    }

    // Backspace erases and moves left
    if (name === 'backspace') {
      if (this.cursor.col > 0) {
        this.cursor.col--;
        this.eraseAtCursor();
        this.updateDrawCursor();
      }
      return;
    }

    // ===== TEXT TOOL: All keys type characters (Moebius default) =====
    if (this.currentTool === 'text') {
      // Type any printable character
      if (ch && ch.length === 1) {
        this.typeCharAtCursor(ch);
        this.cursor.col = this.clampCol(this.cursor.col + 1);
        this.updateDrawCursor();
        return;
      }

      // Space types a space
      if (name === 'space') {
        this.typeCharAtCursor(' ');
        this.cursor.col = this.clampCol(this.cursor.col + 1);
        this.updateDrawCursor();
        return;
      }

      return;
    }

    // ===== OTHER TOOLS: Single-letter shortcuts to switch tools =====

    // Tool shortcuts (only when NOT in text mode)
    const toolShortcuts: Record<string, DrawingTool> = {
      't': 'text',
      'd': 'draw',
      'l': 'line',
      'r': 'box',
      'e': 'ellipse',
      'f': 'fill',
      'p': 'pick',
      's': 'select',
    };

    const lowerCh = ch?.toLowerCase();
    if (lowerCh && toolShortcuts[lowerCh]) {
      this.switchTool(toolShortcuts[lowerCh]);
      return;
    }

    // Undo (U)
    if (lowerCh === 'u') {
      this.undo();
      return;
    }

    // Drawing with space - a single discrete keypress, not part of a mouse
    // drag, so it is its own undo entry (chunked=false).
    if (name === 'space') {
      this.drawAtCursor(false);
    }
  }

  /**
   * Switch to a different drawing tool. Abandons an in-progress shape/select
   * drag exactly like today: the canvas is left untouched, as if the second
   * click had never happened. Before this task that fell out for free
   * (the old shape-preview overlay never touched this.cellCanvas until the
   * second click); now that shape tools mutate the real canvas on every
   * onMove for live preview, abandoning one requires an explicit onCancel to
   * restore it. Also flushes any still-open freehand/half-block drag chunk,
   * so switching tools mid-drag doesn't leave dangling unflushed undo state.
   */
  private switchTool(tool: DrawingTool): void {
    if (this.isDrawing && this.coreState) {
      this.syncToCoreState();
      getToolHandler(this.currentTool).onCancel(this.coreState);
      this.syncFromCoreState();
    }
    this.flushDrawChunk();
    this.currentTool = tool;
    this.isDrawing = false;
    this.lastPreviewPos = null;
    this.updateToolbar();
    this.updateStatusBar();
  }

  /**
   * Type a character at cursor position (for text tool). Each keypress is a
   * single discrete undo entry (chunked=false) - unlike a mouse drag, there
   * is no natural "stroke" boundary to flush on, so every character typed is
   * its own Ctrl+Z step. Routed through paintCell(), not drawTool, because
   * the painted char is whatever was just typed, not necessarily
   * this.currentChar (drawTool always paints state.getCurrentCell()).
   */
  private typeCharAtCursor(char: string): void {
    if (!this.coreState) return;
    const y = this.cursor.line;
    const x = this.cursor.col;
    const cell: Cell = { char, fg: this.currentFg, bg: this.currentBg, blink: false };

    this.syncToCoreState();
    paintCell(this.coreState, x, y, cell, false);
    this.syncFromCoreState();
  }

  private moveCursor(dx: number, dy: number): void {
    if (dy !== 0) {
      // Allow free vertical movement within reasonable bounds (80x25 for ANSI)
      this.cursor.line = Math.max(0, Math.min(999, this.cursor.line + dy));

      // Ensure line exists
      while (this.lines.length <= this.cursor.line) {
        this.lines.push('');
      }

      // Ensure the new line is long enough for the current column position
      const line = this.lines[this.cursor.line] || '';
      if (this.cursor.col > line.length) {
        this.lines[this.cursor.line] = line.padEnd(this.cursor.col, ' ');
      }
    }

    if (dx !== 0) {
      // Allow free horizontal movement (up to maxLineLength)
      this.cursor.col = Math.max(0, Math.min(this.maxLineLength, this.cursor.col + dx));

      // Ensure line exists and is long enough
      const line = this.lines[this.cursor.line] || '';
      if (this.cursor.col > line.length) {
        // Pad line with spaces to cursor position
        this.lines[this.cursor.line] = line.padEnd(this.cursor.col, ' ');
      }
    }
  }

  private insertTextAtCursor(text: string): void {
    const line = this.lines[this.cursor.line] || '';
    const before = line.substring(0, this.cursor.col);
    const after = line.substring(this.cursor.col);

    this.lines[this.cursor.line] = before + text + after;
    this.cursor.col += text.length;
    this.modified = true;
  }

  private overwriteTextAtCursor(text: string): void {
    let line = this.lines[this.cursor.line] || '';

    // Pad line with spaces if cursor is beyond current line length
    if (this.cursor.col > line.length) {
      line = line.padEnd(this.cursor.col, ' ');
    }

    const before = line.substring(0, this.cursor.col);
    const after = line.substring(this.cursor.col + text.length);

    this.lines[this.cursor.line] = before + text + after;
    this.cursor.col += text.length;
    this.modified = true;
  }

  private insertNewLine(): void {
    const line = this.lines[this.cursor.line] || '';
    const before = line.substring(0, this.cursor.col);
    const after = line.substring(this.cursor.col);

    this.lines[this.cursor.line] = before;
    this.lines.splice(this.cursor.line + 1, 0, after);

    this.cursor.line++;
    this.cursor.col = 0;
    this.modified = true;
  }

  private deleteChar(backspace: boolean): void {
    const line = this.lines[this.cursor.line] || '';

    if (backspace) {
      if (this.cursor.col > 0) {
        const before = line.substring(0, this.cursor.col - 1);
        const after = line.substring(this.cursor.col);
        this.lines[this.cursor.line] = before + after;
        this.cursor.col--;
        this.modified = true;
      } else if (this.cursor.line > 0) {
        // Join with previous line
        const prevLine = this.lines[this.cursor.line - 1];
        this.cursor.col = prevLine.length;
        this.lines[this.cursor.line - 1] = prevLine + line;
        this.lines.splice(this.cursor.line, 1);
        this.cursor.line--;
        this.modified = true;
      }
    } else {
      if (this.cursor.col < line.length) {
        const before = line.substring(0, this.cursor.col);
        const after = line.substring(this.cursor.col + 1);
        this.lines[this.cursor.line] = before + after;
        this.modified = true;
      } else if (this.cursor.line < this.lines.length - 1) {
        // Join with next line
        const nextLine = this.lines[this.cursor.line + 1];
        this.lines[this.cursor.line] = line + nextLine;
        this.lines.splice(this.cursor.line + 1, 1);
        this.modified = true;
      }
    }
  }

  private toggleMode(): void {
    if (this.mode === 'text') {
      this.mode = 'draw';
      // Switch to canvas
      this.viewport.hide();
      this.drawCanvas.show();
      this.drawCursor.show();
      this.updateDrawCursor();
      this.drawCanvas.focus();
    } else {
      this.mode = 'text';
      // Switch to viewport
      this.drawCanvas.hide();
      this.drawCursor.hide();
      this.viewport.show();
      this.viewport.focus();
    }
    this.updateToolbar();
    this.updateStatusBar();
    if (this.screen) {
      this.screen.render();
    }
  }

  private updateDrawCursor(): void {
    if (!this.drawCursor || this.mode !== 'draw') return;

    // Position cursor overlay at the current cursor position
    const canvasTop = (this.drawCanvas.position.top as number) || 0;
    const canvasLeft = (this.drawCanvas.position.left as number) || 0;

    // Scaled: the overlay lands on the cell's first drawn character and
    // covers the whole magnified cell, so it marks the cell an artist sees
    // rather than its top-left corner. At the default 1/1 this is the
    // 1x1 box at (line, col) it has always been.
    // In half-block mode the stroke lands on HALF a cell, so the cursor
    // says which half - asked while drawing a Pengo egg, "the red marker
    // dont align with the blocks, or is that becasue its halfblocks?". It
    // was: a cell-sized marker over art whose pixels are half-cells cannot
    // point at the pixel you are about to paint.
    //
    // Only from 2:1 up. At actual size a cell IS one character row and half
    // of it is not a thing a terminal can draw, so the cursor stays whole.
    const halfBlockCursor = this.brushMode === 'half-block' && this.scaleY >= 2;
    const height = halfBlockCursor ? Math.floor(this.scaleY / 2) : this.scaleY;
    const subOffset = halfBlockCursor && this.halfBlockSubY === 1 ? height : 0;

    this.drawCursor.top = canvasTop + this.cursor.line * this.scaleY + subOffset;
    this.drawCursor.left = canvasLeft + this.cursor.col * this.scaleX;
    this.drawCursor.width = this.scaleX;
    this.drawCursor.height = height;

    // What is UNDER the cursor, reversed - so the art stays readable while
    // the cursor sits on it. An empty cell has nothing to reverse, so there
    // the cursor is still a solid marker of the brush, which is also what
    // makes it findable on a blank canvas.
    const cell = this.cellCanvas?.[this.cursor.line]?.[this.cursor.col];
    const emptyCell = !cell || cell.transparent || !cell.char || cell.char === ' ';
    if (emptyCell) {
      this.drawCursor.style = { bg: 'red', fg: 'red' };
      this.drawCursor.setContent(this.currentChar.repeat(this.scaleX));
      return;
    }

    this.drawCursor.style = { bg: 'black', fg: 'white' };
    const firstSub = subOffset;
    const rows: string[] = [];
    for (let row = 0; row < height; row++) {
      rows.push(invertTags(this.magnifiedCellTag(cell, firstSub + row, this.cursor.col, this.cursor.line)));
    }
    this.drawCursor.setContent(rows.join('\n'));
  }

  /**
   * Paint the current fg/bg/char cell at the cursor through the library's
   * drawTool - onStart's chunk guard makes repeated calls from a continuous
   * mouse drag safe (only the first call of a stroke pushes undo state; the
   * rest just paint), flushed on mouseup (flushDrawChunk()). A single
   * keyboard press (chunked=false) instead pushes its own immediate undo
   * entry, since there's no drag to flush at the end of.
   */
  private drawAtCursor(chunked: boolean = true): void {
    if (!this.coreState) return;
    const y = this.cursor.line;
    const x = this.cursor.col;

    this.syncToCoreState();
    if (chunked) {
      drawTool.onStart(this.coreState, x, y);
    } else {
      paintCell(this.coreState, x, y, this.coreState.getCurrentCell(), false);
    }
    this.syncFromCoreState();
  }

  /**
   * Erase (Backspace) is a discrete keyboard action, not a drag - one
   * immediate undo entry per press (chunked=false). Routed through
   * paintCell(), not drawTool, because the empty/transparent cell it paints
   * is independent of currentFg/Bg/Char.
   */
  private eraseAtCursor(): void {
    if (!this.coreState) return;
    const y = this.cursor.line;
    const x = this.cursor.col;
    const emptyCell: Cell = this.transparentBackground
      ? { char: ' ', fg: 7, bg: 0, blink: false, transparent: true }
      : { char: ' ', fg: 7, bg: 0, blink: false };

    this.syncToCoreState();
    paintCell(this.coreState, x, y, emptyCell, false);
    this.syncFromCoreState();
  }

  /**
   * Draw with background color (Moebius-style RMB drawing)
   * Swaps FG and BG colors so RMB draws with the current background color.
   * Chunked like drawAtCursor() - RMB drag/click flushes on mouseup the same
   * way LMB does. Routed through paintCell() (not drawTool) because the
   * swapped-colors cell isn't state.getCurrentCell().
   */
  private drawWithBackgroundColor(): void {
    if (!this.coreState) return;
    const y = this.cursor.line;
    const x = this.cursor.col;
    const cell: Cell = {
      char: this.currentChar,
      fg: this.currentBg,  // Use BG as FG
      bg: this.currentFg,  // Use FG as BG
      blink: false,
    };

    this.syncToCoreState();
    paintCell(this.coreState, x, y, cell, true);
    this.syncFromCoreState();
  }

  // ============================================
  // HALF-BLOCK DRAWING SYSTEM (Moebius-style 2x resolution)
  // ============================================

  /**
   * Draw in half-block mode at cursor position
   * Each cell represents 2 vertical "pixels" using ▀▄█ characters
   * FG color = upper half, BG color = lower half
   */
  private drawHalfBlock(x: number, y: number, subY: 0 | 1): void {
    if (!this.cellCanvas) return;

    const existingCell = CoreCanvas.getCell(this.cellCanvas, x, y);
    if (!existingCell) return;

    // Determine what's currently in this cell
    const currentChar = existingCell.char;
    const currentFg = existingCell.fg;
    const currentBg = existingCell.bg;

    // Calculate new cell state based on which half we're drawing
    let newChar: string;
    let newFg: number;
    let newBg: number;

    if (subY === 0) {
      // Drawing upper half
      if (currentChar === HALF_BLOCK.LOWER || currentChar === HALF_BLOCK.FULL) {
        // Lower half has content - check if colors match
        if (this.currentFg === currentBg) {
          // Same color - use full block
          newChar = HALF_BLOCK.FULL;
          newFg = this.currentFg;
          newBg = this.currentFg;
        } else {
          // Different colors - use upper half block
          newChar = HALF_BLOCK.UPPER;
          newFg = this.currentFg;  // Upper = FG
          newBg = currentBg;       // Lower = keep existing BG
        }
      } else if (currentChar === HALF_BLOCK.UPPER) {
        // Already has upper half - just change color
        newChar = HALF_BLOCK.UPPER;
        newFg = this.currentFg;
        newBg = currentBg;
      } else {
        // Empty or other char - set upper half only
        newChar = HALF_BLOCK.UPPER;
        newFg = this.currentFg;
        newBg = this.currentBg;  // BG will show as lower half (empty)
      }
    } else {
      // Drawing lower half
      if (currentChar === HALF_BLOCK.UPPER || currentChar === HALF_BLOCK.FULL) {
        // Upper half has content - check if colors match
        if (this.currentFg === currentFg) {
          // Same color - use full block
          newChar = HALF_BLOCK.FULL;
          newFg = this.currentFg;
          newBg = this.currentFg;
        } else {
          // Different colors - use upper half block (FG=upper, BG=lower)
          newChar = HALF_BLOCK.UPPER;
          newFg = currentFg;       // Upper = keep existing FG
          newBg = this.currentFg;  // Lower = our color in BG
        }
      } else if (currentChar === HALF_BLOCK.LOWER) {
        // Already has lower half - change to use upper half representation
        newChar = HALF_BLOCK.UPPER;
        newFg = currentBg;         // Old BG becomes FG (upper)
        newBg = this.currentFg;    // New color in BG (lower)
      } else {
        // Empty or other char - set lower half only using ▄
        newChar = HALF_BLOCK.LOWER;
        newFg = this.currentFg;    // ▄ uses FG for the lower part
        newBg = this.currentBg;
      }
    }

    const newCell: Cell = {
      char: newChar,
      fg: newFg,
      bg: newBg,
      blink: false,
    };

    if (this.coreState) {
      this.syncToCoreState();
      paintCell(this.coreState, x, y, newCell, true);
      this.syncFromCoreState();
    }
  }

  /**
   * Erase in half-block mode at cursor position
   */
  private eraseHalfBlock(x: number, y: number, subY: 0 | 1): void {
    if (!this.cellCanvas) return;

    const existingCell = CoreCanvas.getCell(this.cellCanvas, x, y);
    if (!existingCell) return;

    const currentChar = existingCell.char;
    const currentFg = existingCell.fg;
    const currentBg = existingCell.bg;

    let newChar: string;
    let newFg: number;
    let newBg: number;

    if (subY === 0) {
      // Erasing upper half
      if (currentChar === HALF_BLOCK.FULL || currentChar === HALF_BLOCK.UPPER) {
        // Has upper content - remove it, keep lower if exists
        if (currentChar === HALF_BLOCK.FULL) {
          newChar = HALF_BLOCK.LOWER;
          newFg = currentBg;  // BG becomes FG for ▄
          newBg = 0;          // Black background
        } else {
          newChar = HALF_BLOCK.LOWER;
          newFg = currentBg;
          newBg = 0;
        }
      } else {
        // No upper content - nothing to erase
        return;
      }
    } else {
      // Erasing lower half
      if (currentChar === HALF_BLOCK.FULL || currentChar === HALF_BLOCK.UPPER) {
        // Has lower content (in BG) - remove it, keep upper
        newChar = HALF_BLOCK.UPPER;
        newFg = currentFg;
        newBg = 0;  // Black for empty lower half
      } else if (currentChar === HALF_BLOCK.LOWER) {
        // Only has lower half - clear it
        newChar = HALF_BLOCK.EMPTY;
        newFg = 7;
        newBg = 0;
      } else {
        return;
      }
    }

    const newCell: Cell = {
      char: newChar,
      fg: newFg,
      bg: newBg,
      blink: false,
    };

    CoreCanvas.setCell(this.cellCanvas, x, y, newCell);
    this.syncCoreCanvasToDisplay();
    this.modified = true;
  }

  /**
   * Draw half-block with background color (Moebius-style RMB)
   * Uses background color instead of foreground for the half being drawn
   */
  private drawHalfBlockWithBg(x: number, y: number, subY: 0 | 1): void {
    if (!this.cellCanvas) return;

    const existingCell = CoreCanvas.getCell(this.cellCanvas, x, y);
    if (!existingCell) return;

    const currentChar = existingCell.char;
    const currentFg = existingCell.fg;
    const currentBg = existingCell.bg;

    let newChar: string;
    let newFg: number;
    let newBg: number;

    // Use background color instead of foreground (swapped)
    const drawColor = this.currentBg;

    if (subY === 0) {
      // Drawing upper half with BG color
      if (currentChar === HALF_BLOCK.EMPTY || currentChar === ' ') {
        newChar = HALF_BLOCK.UPPER;
        newFg = drawColor;
        newBg = 0;
      } else if (currentChar === HALF_BLOCK.LOWER) {
        newChar = HALF_BLOCK.FULL;
        newFg = drawColor;
        newBg = currentFg;
      } else if (currentChar === HALF_BLOCK.UPPER) {
        newChar = HALF_BLOCK.UPPER;
        newFg = drawColor;
        newBg = currentBg;
      } else {
        newChar = HALF_BLOCK.FULL;
        newFg = drawColor;
        newBg = currentBg;
      }
    } else {
      // Drawing lower half with BG color
      if (currentChar === HALF_BLOCK.EMPTY || currentChar === ' ') {
        newChar = HALF_BLOCK.LOWER;
        newFg = drawColor;
        newBg = 0;
      } else if (currentChar === HALF_BLOCK.UPPER) {
        newChar = HALF_BLOCK.FULL;
        newFg = currentFg;
        newBg = drawColor;
      } else if (currentChar === HALF_BLOCK.LOWER) {
        newChar = HALF_BLOCK.LOWER;
        newFg = drawColor;
        newBg = currentBg;
      } else {
        newChar = HALF_BLOCK.FULL;
        newFg = currentFg;
        newBg = drawColor;
      }
    }

    const newCell: Cell = {
      char: newChar,
      fg: newFg,
      bg: newBg,
      blink: false,
    };

    if (this.coreState) {
      this.syncToCoreState();
      paintCell(this.coreState, x, y, newCell, true);
      this.syncFromCoreState();
    }
  }

  /**
   * Get sub-Y position from mouse Y coordinate
   * Each cell is 1 character tall, but we track upper/lower half
   */
  private getSubYFromMouseY(mouseY: number, cellY: number): 0 | 1 {
    // In a terminal, we can't truly get sub-pixel position
    // Use alternating pattern based on cursor movement
    // Or track mouse micro-movements if available
    // For now, toggle on each click or use cursor.line parity
    return this.halfBlockSubY;
  }

  /**
   * Toggle which half-block sub-row is active
   */
  private toggleHalfBlockSubY(): void {
    this.halfBlockSubY = this.halfBlockSubY === 0 ? 1 : 0;
    this.updateStatusBar();
  }

  /**
   * Switch brush mode
   */
  private switchBrushMode(mode: BrushMode): void {
    this.brushMode = mode;
    this.updateStatusBar();
    this.updateSidebarBrushMode();
  }

  /**
   * Update sidebar to show current brush mode
   */
  private updateSidebarBrushMode(): void {
    if (!this.sidebar) return;

    // Find and update brush mode buttons in sidebar
    // The brush mode buttons are children of sidebar at positions 21-23
    // This is a simplified approach - in production would use references
    const children = this.sidebar.children;
    const brushModes: BrushMode[] = ['text', 'half-block'];

    // Update brush mode button highlighting
    children.forEach((child) => {
      if (child instanceof Box) {
        const content = (child as any)._originalContent || child.content;
        if (content && typeof content === 'string') {
          if (content.includes('Text') || content.includes('HBlock')) {
            const isText = content.includes('Text');
            const mode: BrushMode = isText ? 'text' : 'half-block';
            const label = isText ? 'Text' : 'HBlock';
            const isSelected = this.brushMode === mode;
            child.setContent(
              (isSelected ? '{inverse}' : '') +
              `{cyan-fg}${label}{/cyan-fg}` +
              (isSelected ? '{/inverse}' : '')
            );
          }
          // Update sub-row indicator
          if (content.includes('Upper') || content.includes('Lower') || content.includes('▀') || content.includes('▄')) {
            if (this.brushMode === 'half-block') {
              child.setContent(`{yellow-fg}${this.halfBlockSubY === 0 ? '▀Upper' : '▄Lower'}{/yellow-fg}`);
            } else {
              child.setContent('');
            }
          }
        }
      }
    });

    this.screen?.render();
  }

  // ============================================
  // LIBRARY TOOL DISPATCH
  // ============================================

  /**
   * Push the widget's live canvas + current paint attributes into coreState
   * immediately before invoking a library tool handler. coreState is the one
   * persistent EditorState per widget instance (constructed once, never
   * recreated) - its identity is what the library's per-instance undo/redo
   * (and selection) WeakMaps key on, so two ANSIEditor widgets never undo or
   * select for each other. Every other method in this file still reads
   * this.cellCanvas/currentFg/currentBg/currentChar directly (getContent,
   * save, layers, syncCoreCanvasToDisplay, ...) - re-pointing all of those
   * at coreState was out of scope for this task - so every tool invocation
   * is bracketed by this and syncFromCoreState().
   */
  private syncToCoreState(): void {
    if (!this.coreState || !this.cellCanvas) return;
    this.coreState.setCanvas(this.cellCanvas);
    this.coreState.setCurrentFg(this.currentFg);
    this.coreState.setCurrentBg(this.currentBg);
    this.coreState.setCurrentChar(this.currentChar);
  }

  /**
   * Pull the canvas (and any tool-driven attribute change, e.g. pickTool's
   * fg/bg/char) back out of coreState after a library tool handler runs.
   * A shape tool's onMove/onEnd replaces coreState's canvas array wholesale
   * (Canvas.cloneCanvas()), so this.cellCanvas must be re-pointed at the new
   * array, not assumed to still be the same reference - and the active
   * layer's canvas reference kept in sync the same way setCoreCanvas()/
   * newDocument() already do (Task 1's invariant).
   */
  private syncFromCoreState(): void {
    if (!this.coreState) return;
    const canvas = this.coreState.getCanvas();
    if (canvas) {
      this.cellCanvas = canvas;
      if (this.layers[this.activeLayerIndex]) {
        this.layers[this.activeLayerIndex].canvas = this.cellCanvas;
      }
    }
    this.currentFg = this.coreState.getCurrentFg();
    this.currentBg = this.coreState.getCurrentBg();
    this.currentChar = this.coreState.getCurrentChar();
    this.syncCoreCanvasToDisplay();
    this.modified = true;
  }

  /**
   * Flush a still-open chunked undo entry from a continuous freehand/
   * half-block/RMB drag (drawTool.onStart / paintCell(..., true) both open
   * one; drawTool.onEnd just flushes it regardless of which one started it,
   * since they share the same per-instance undo data). Safe to call even
   * when nothing is chunked (no-op) - called unconditionally on mouseup.
   */
  private flushDrawChunk(): void {
    if (!this.coreState) return;
    drawTool.onEnd(this.coreState, this.cursor.col, this.cursor.line);
  }

  /**
   * The ONLY way this.cellCanvas is allowed to be re-pointed at a different
   * Cell[][] array OUTSIDE the syncToCoreState()/syncFromCoreState()
   * tool-call bracket - layer switch/add/delete/merge/flatten, and the
   * public setCoreCanvas(). Every one of those is, from the undo system's
   * perspective, switching documents: the library's undo/redo stacks are a
   * timeline of snapshots of ONE Cell[][] array. undo()/redo() call
   * undoDrawing()/redoDrawing() directly, WITHOUT going through
   * syncToCoreState() first (they don't need the current fg/bg/char) - so if
   * this.cellCanvas is swapped by a raw assignment instead of through here,
   * coreState keeps pointing at the OLD array until the next tool call
   * happens to refresh it. A bare Ctrl+Z in that window pops a snapshot
   * built against the old canvas and writes it into whichever layer is
   * active NOW via syncFromCoreState()'s
   * `this.layers[activeLayerIndex].canvas = this.cellCanvas` - silently
   * destroying content on a layer nobody drew on. Fixed at the root by
   * keeping coreState's canvas reference authoritative and IMMEDIATELY
   * current, never lazily refreshed, and by treating a canvas swap as a new
   * undo timeline (clearUndoStack) rather than trying to preserve history
   * that no longer describes what's on screen - the same treatment
   * newDocument() (File > New) already gave itself for exactly this reason.
   *
   * Rejected alternative: validate-before-pop (tag each undo entry with
   * which canvas/layer it belongs to, check at undo() time). Considered and
   * rejected as more invasive for no behavioral gain here - it would still
   * have to decide what to do on a mismatch (skip deeper into the stack,
   * breaking LIFO, or refuse and report "nothing to undo", which is exactly
   * what clearing the stack up front already gives for free) and it doesn't
   * remove the root cause (coreState still going stale between the swap and
   * the next tool call) the way keeping it always-current does.
   *
   * Rejected alternative: per-layer undo histories (rebase instead of
   * clear). Would preserve "switch back to layer 1, still able to undo the
   * edit from before you left it" - a real nicety - but requires N
   * independent undo timelines keyed by layer identity, a materially larger
   * feature than this bug fix calls for. Not built here; noted in the
   * report as a disclosed limitation of the clear-based fix.
   *
   * Also folds in Task 1's `this.layers[activeLayerIndex].canvas` sync (the
   * same invariant setCoreCanvas()/newDocument() used to each maintain by
   * hand) so every non-tool-bracket canvas swap keeps both invariants in
   * one place instead of two easy-to-forget call sites.
   */
  private adoptCellCanvas(canvas: Cell[][]): void {
    this.cellCanvas = canvas;
    if (this.layers[this.activeLayerIndex]) {
      this.layers[this.activeLayerIndex].canvas = canvas;
    }
    if (this.coreState) {
      this.coreState.setCanvas(canvas);
      clearUndoStack(this.coreState);
    }
  }

  /** ANSI colour names indexed 0-15, shared by every cell-to-display-tag call. */
  private static readonly ANSI_COLOR_NAMES = [
    'black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white',
    'gray', 'lightred', 'lightgreen', 'lightyellow', 'lightblue', 'lightmagenta', 'lightcyan', 'lightwhite',
  ];

  /**
   * Render one cell as a blessed content tag, including the transparent
   * guide glyph. The single definition syncCoreCanvasToDisplay() and
   * renderSelectionPreview() both use, so the guide-glyph handling can't
   * drift between the "committed canvas" and "live selection drag" render
   * paths the way it did before this task (renderPreview() duplicated this
   * logic without the transparent branch - see task-4-report.md).
   */
  /**
   * The one place a canvas becomes blessed content. Each cell is emitted
   * scaleX times across and each cell row scaleY times down, so a magnified
   * canvas is a pure repeat of what one character per cell already
   * produced - there is no second, "scaled" rendering path that could
   * disagree with the plain one, and at the default 1/1 the output is
   * byte-identical to the two hand-written loops this replaced.
   *
   * `cellAt` lets a caller substitute cells it wants drawn instead of the
   * canvas's own - the marching-ants selection overlay does exactly that -
   * without duplicating the loop and its scaling.
   */
  /**
   * What is visible at (x, y), the layer stack included.
   *
   * Each layer owns a canvas and the ACTIVE one is what the tools paint,
   * but nothing ever composited them: a layer's `visible` flag changed no
   * pixel, so Add Layer, Toggle Visibility, Move Up and Move Down were a
   * menu that did nothing you could see (audited 2026-09-02 against "most
   * entries seem dead"). The active layer wins wherever it has been drawn
   * on; where it has not, the topmost VISIBLE layer below shows through,
   * which is what a layer is for.
   */
  private compositeCellAt(x: number, y: number): Cell {
    const own = this.cellCanvas?.[y]?.[x];
    const blank = (c?: Cell): boolean =>
      !c || c.transparent === true || ((c.char === ' ' || !c.char) && !c.bg);
    if (!blank(own)) return own!;

    if (this.layers.length > 1) {
      // Down from the active layer: nearer layers hide farther ones.
      for (let i = this.activeLayerIndex - 1; i >= 0; i--) {
        const layer = this.layers[i];
        if (!layer?.visible) continue;
        const cell = layer.canvas?.[y]?.[x];
        if (!blank(cell)) return cell!;
      }
    }
    return own || { char: ' ', fg: 7, bg: 0 };
  }

  private buildCanvasContent(cellAt: (x: number, y: number) => Cell): string {
    const rows: string[] = [];
    for (let y = 0; y < this.canvasH; y++) {
      // Built per sub-row, not once and repeated: a half-block cell shows
      // DIFFERENT content in the top half of its magnified box than in the
      // bottom, because its two halves are pixels.
      for (let sub = 0; sub < this.scaleY; sub++) {
        let row = '';
        for (let x = 0; x < this.canvasW; x++) {
          row += this.magnifiedCellTag(cellAt(x, y), sub, x, y);
        }
        rows.push(row);
      }
    }
    return rows.join('\n');
  }

  /**
   * One cell's appearance in sub-row `sub` of its magnified box.
   *
   * At scale 1 this is just the cell. Magnified, a half-block glyph must be
   * RESOLVED rather than repeated: '▀' drawn four times down is four rows of
   * "upper half filled" - stripes - when what magnification means is two
   * solid rows of the top colour over two of the bottom. Reported from the
   * sprite studio, where a crocodile came out as horizontal bars.
   *
   * An ordinary character is not a pixel pair, so it is repeated as before.
   * An odd scale gives the extra row to the TOP half, matching how the
   * half-block cursor already treats the upper row as the default.
   */
  private magnifiedCellTag(cell: Cell, sub: number, x?: number, y?: number): string {
    // A ghost shows only where the artist has not drawn: their own work
    // always wins, so the underlay can never hide what is being made.
    if (cell.transparent && x !== undefined && y !== undefined) {
      const ghost = this.underlayCanvas?.[y]?.[x];
      if (ghost && !ghost.transparent) {
        return `{gray-fg}{black-bg}${(ghost.char || ' ').repeat(this.scaleX)}{/black-bg}{/gray-fg}`;
      }
    }

    // A hole is MARKED, not textured. Repeating the guide dot across every
    // character of a magnified cell turned each hole into a filled grid of
    // dots that competed with the art - "dotted artefacts". One dot, in the
    // middle of the cell, says the same thing.
    if (cell.transparent) {
      if (!this.transparencyGuide) {
        // A hole reads as the background it will actually let through.
        return `{black-fg}{black-bg}${' '.repeat(this.scaleX)}{/black-bg}{/black-fg}`;
      }
      if (this.scaleX === 1 && this.scaleY === 1) {
        return this.cellToDisplayTag(cell, 1);
      }
      const midRow = Math.floor(this.scaleY / 2);
      const midCol = Math.floor(this.scaleX / 2);
      const run = sub === midRow
        ? ' '.repeat(midCol) + '.' + ' '.repeat(this.scaleX - midCol - 1)
        : ' '.repeat(this.scaleX);
      return `{gray-fg}{black-bg}${run}{/black-bg}{/gray-fg}`;
    }

    if (this.scaleY === 1) {
      return this.cellToDisplayTag(cell, this.scaleX);
    }

    const isUpper = cell.char === HALF_BLOCK.UPPER;
    const isLower = cell.char === HALF_BLOCK.LOWER;
    const isFull = cell.char === HALF_BLOCK.FULL;
    if (!isUpper && !isLower && !isFull) {
      return this.cellToDisplayTag(cell, this.scaleX);
    }

    // Which colour this sub-row is showing. '▀' paints fg on top and bg
    // below; '▄' is the same glyph pair with the roles swapped; '█' is one
    // colour throughout.
    const topHalf = Math.ceil(this.scaleY / 2);
    const inTop = sub < topHalf;
    let colour: number;
    if (isFull) colour = cell.fg;
    else if (isUpper) colour = inTop ? cell.fg : cell.bg;
    else colour = inTop ? cell.bg : cell.fg;

    // Solid, as a full block in that colour on that colour - so the row
    // reads as one flat area however the terminal renders block glyphs.
    return this.cellToDisplayTag({ char: HALF_BLOCK.FULL, fg: colour, bg: colour }, this.scaleX);
  }

  private cellToDisplayTag(cell: Cell, repeat: number = 1): string {
    // `repeat` widens the cell INSIDE one pair of tags rather than emitting
    // the whole tagged run N times: same pixels, a third of the content
    // string at scale 3, and one colour switch per cell instead of three.
    if (cell.transparent) {
      return this.transparencyGuide
        ? `{gray-fg}{black-bg}${'.'.repeat(repeat)}{/black-bg}{/gray-fg}`
        : `{black-fg}{black-bg}${' '.repeat(repeat)}{/black-bg}{/black-fg}`;
    }
    const fgColor = ANSIEditor.ANSI_COLOR_NAMES[cell.fg] || 'white';
    const bgColor = ANSIEditor.ANSI_COLOR_NAMES[cell.bg] || 'black';
    const char = (cell.char || ' ').repeat(repeat);
    return `{${fgColor}-fg}{${bgColor}-bg}${char}{/${bgColor}-bg}{/${fgColor}-fg}`;
  }

  /**
   * Update the live preview while dragging a shape/select tool. For the
   * five canvas-mutating shape tools (line/box/box-fill/ellipse/
   * ellipse-fill), onMove restores the pre-drag snapshot and redraws the
   * shape onto it fresh each call (see drawing-tools.ts's peekUndoCanvas
   * usage), replacing coreState's canvas - so syncFromCoreState() +
   * syncCoreCanvasToDisplay() IS the live preview, with no separate overlay
   * needed, and it inherits the transparent-guide-glyph rendering for free.
   * select never mutates the canvas (a selection is a read-only rectangle),
   * so it gets its own renderSelectionPreview() overlay instead.
   */
  private updateShapePreview(x: number, y: number): void {
    if (!this.isDrawing || !this.cellCanvas || !this.coreState) return;

    // Only update if position changed
    if (this.lastPreviewPos && this.lastPreviewPos.x === x && this.lastPreviewPos.y === y) {
      return;
    }
    this.lastPreviewPos = { x, y };

    this.syncToCoreState();
    getToolHandler(this.currentTool).onMove(this.coreState, x, y);

    if (this.currentTool === 'select') {
      this.renderSelectionPreview();
    } else {
      this.syncFromCoreState();
    }
  }

  /**
   * Render the marching-ants preview for an in-progress select-tool drag.
   * Reads the in-progress rectangle from coreState.getDrawingStart/EndPoint()
   * - the same values selectTool.onMove already stores - instead of keeping
   * a second, separately-tracked copy of "what's being dragged".
   */
  private renderSelectionPreview(): void {
    if (!this.cellCanvas || !this.coreState) return;
    const start = this.coreState.getDrawingStartPoint();
    const end = this.coreState.getDrawingEndPoint();
    if (!start || !end) {
      this.syncCoreCanvasToDisplay();
      return;
    }

    const minX = Math.max(0, Math.min(start.col, end.col));
    const maxX = Math.min(this.canvasW - 1, Math.max(start.col, end.col));
    const minY = Math.max(0, Math.min(start.line, end.line));
    const maxY = Math.min(this.canvasH - 1, Math.max(start.line, end.line));
    const marchCell: Cell = { char: '·', fg: 15, bg: 0, blink: false };

    this.drawCanvas.setContent(this.buildCanvasContent((x, y) => {
      const isEdge = x >= minX && x <= maxX && y >= minY && y <= maxY &&
        (y === minY || y === maxY || x === minX || x === maxX);
      const useMarch = isEdge && (x + y) % 2 === 0;
      return useMarch ? marchCell : this.compositeCellAt(x, y);
    }));
    if (this.drawCursor) {
      this.drawCursor.setFront();
    }
  }

  /**
   * A two-click shape/select tool: first click starts it (onStart), second
   * click commits it (onEnd). Shared by all six tools that follow this
   * pattern (line/box/box-fill/ellipse/ellipse-fill/select) - dispatched
   * through getToolHandler() so adding an 11th such tool needs no widget
   * change here.
   */
  private handleShapeToolClick(x: number, y: number): void {
    if (!this.coreState) return;
    const handler = getToolHandler(this.currentTool);

    this.syncToCoreState();
    if (!this.isDrawing) {
      this.isDrawing = true;
      this.lastPreviewPos = null;
      handler.onStart(this.coreState, x, y);
    } else {
      handler.onEnd(this.coreState, x, y);
      if (this.currentTool === 'select') {
        const bounds = getSelectionBounds(this.coreState);
        if (bounds) {
          this.selection = bounds;
        }
      }
      this.isDrawing = false;
    }
    this.syncFromCoreState();
  }

  /**
   * Handle tool-specific click behavior using the shared library tools.
   */
  private handleToolClick(x: number, y: number): void {
    if (!this.cellCanvas || !this.coreState) return;

    switch (this.currentTool) {
      case 'draw':
        // Use half-block mode if enabled
        if (this.brushMode === 'half-block') {
          this.drawHalfBlock(x, y, this.halfBlockSubY);
        } else {
          this.drawAtCursor();
        }
        break;

      case 'text':
        // Simple draw at cursor
        this.drawAtCursor();
        break;

      case 'line':
      case 'box':
      case 'box-fill':
      case 'ellipse':
      case 'ellipse-fill':
      case 'select':
        this.handleShapeToolClick(x, y);
        break;

      case 'fill':
        this.syncToCoreState();
        fillTool.onStart(this.coreState, x, y);
        this.syncFromCoreState();
        break;

      case 'pick':
        this.syncToCoreState();
        pickTool.onStart(this.coreState, x, y);
        this.syncFromCoreState();
        break;
    }

    this.modified = true;
  }

  /**
   * Sync core canvas to blessed Canvas widget for display
   * ANSI art canvas (canvasW x canvasH), 1 character per cell
   */
  private syncCoreCanvasToDisplay(): void {
    if (!this.cellCanvas) return;

    // A transparent cell (see cellToDisplayTag()) paints a dim guide glyph
    // so an artist can see the through-holes - getCoreCanvas() still
    // returns the cell's real char/fg/bg untouched; this is
    // presentation-only, as is the magnification buildCanvasContent applies.
    this.drawCanvas.setContent(this.buildCanvasContent((x, y) => this.compositeCellAt(x, y)));
    // Ensure cursor stays above canvas content
    if (this.drawCursor) {
      this.drawCursor.setFront();
    }
  }

  private updateDisplay(): void {
    if (this.mode === 'text') {
      this.renderTextMode();
    } else {
      // Draw mode: update cursor position
      this.updateDrawCursor();
    }

    this.updateStatusBar();
    this.updateToolbar();

    if (this.screen) {
      this.screen.render();
    }
  }

  private renderTextMode(): void {
    const viewportHeight = (this.viewport.height as number) - 2;
    const viewportWidth = (this.viewport.width as number) - 2;

    // Auto-scroll to cursor
    if (this.cursor.line < this.scrollTop) {
      this.scrollTop = this.cursor.line;
    } else if (this.cursor.line >= this.scrollTop + viewportHeight) {
      this.scrollTop = this.cursor.line - viewportHeight + 1;
    }

    const lineNumberWidth = this.showLineNumbers ? 5 : 0;
    const content: string[] = [];

    for (let i = 0; i < viewportHeight; i++) {
      const lineIndex = this.scrollTop + i;
      if (lineIndex >= this.lines.length) break;

      const line = this.lines[lineIndex] || '';
      let displayLine = '';

      if (this.showLineNumbers) {
        displayLine += `{gray-fg}${(lineIndex + 1).toString().padStart(4)} {/}`;
      }

      // Show cursor on current line
      if (lineIndex === this.cursor.line) {
        const before = line.substring(0, this.cursor.col);
        const at = line[this.cursor.col] || ' ';
        const after = line.substring(this.cursor.col + 1);
        displayLine += before + `{inverse}${at}{/inverse}` + after;
      } else {
        displayLine += line;
      }

      content.push(displayLine);
    }

    this.viewport.setContent(content.join('\n'));
  }

  private updateStatusBar(): void {
    if (!this.statusBar) return;

    // Moebius-style status bar: position, canvas size, colors, tool, character, brush mode
    const colors = [
      'black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white',
      'gray', 'lightred', 'lightgreen', 'lightyellow', 'lightblue', 'lightmagenta', 'lightcyan', 'lightwhite',
    ];

    const modifiedMark = this.modified ? '{yellow-fg}*{/}' : ' ';
    const pos = `{white-fg}X:${(this.cursor.col + 1).toString().padStart(3)} Y:${(this.cursor.line + 1).toString().padStart(3)}{/}`;
    const canvasSize = `{gray-fg}${this.canvasW}x${this.canvasH}{/}`;
    const charPreview = this.currentChar || '█';
    const fgColor = colors[this.currentFg] || 'white';
    const bgColor = colors[this.currentBg] || 'black';

    const toolNames: Record<DrawingTool, string> = {
      'draw': 'DRAW',
      'line': 'LINE',
      'box': 'RECT',
      'box-fill': 'FILL-RECT',
      'ellipse': 'ELLIPSE',
      'ellipse-fill': 'FILL-ELLIPSE',
      'fill': 'FILL',
      'pick': 'PICK',
      'select': 'SELECT',
      'text': 'TEXT',
    };
    const toolName = toolNames[this.currentTool] || 'TEXT';
    const drawingState = this.isDrawing ? ' {yellow-fg}[1]{/}' : '';
    const iceIndicator = this.iceColorsEnabled ? '{magenta-fg}iCE{/}' : '';
    const layerInfo = this.layers.length > 1 ? `{cyan-fg}L${this.activeLayerIndex + 1}/${this.layers.length}{/}` : '';

    // Brush mode indicator
    const brushModeNames: Record<BrushMode, string> = {
      'text': '',
      'half-block': 'HLF',
      'custom': 'CUS',
      'shading': 'SHD',
      'colorize': 'COL',
    };
    const brushIndicator = this.brushMode !== 'text'
      ? `{green-fg}${brushModeNames[this.brushMode]}${this.brushMode === 'half-block' ? (this.halfBlockSubY === 0 ? '▀' : '▄') : ''}{/}`
      : '';

    // Format: [*] X:001 Y:001 | WxH | FG:7 BG:0 | [char] | TOOL | Brush | Layer | iCE
    //
    // The host's strip sits on the right of this same row, painted over
    // whatever is under it. So the tail readouts are dropped, cheapest
    // first, until what is left fits in the columns before it - a status
    // bar half-covered by the strip would be worse than one that says less.
    // Each readout, in display order, with the order they are GIVEN UP in.
    // Position and tool are never dropped: they are what the bar is for.
    const pieces: Array<{ text: string; drop: number }> = [
      { text: ` ${modifiedMark} ${pos}`, drop: Infinity },
      { text: ` | ${canvasSize}`, drop: 4 },
      { text: ` | {${fgColor}-fg}{${bgColor}-bg}${charPreview}{/}` +
              ` {${fgColor}-fg}FG:${this.currentFg.toString().padStart(2)}{/}` +
              ` {${bgColor}-bg}{white-fg}BG:${this.currentBg.toString().padStart(2)}{/}`, drop: 5 },
      { text: ` | {cyan-fg}${toolName}{/}${drawingState}`, drop: Infinity },
      { text: brushIndicator ? ` ${brushIndicator}` : '', drop: 3 },
      { text: layerInfo ? ` | ${layerInfo}` : '', drop: 2 },
      { text: iceIndicator ? ` ${iceIndicator}` : '', drop: 1 },
    ];

    const room = (this.width as number)
      - (this.extraToolbarWidth > 0 ? this.extraToolbarWidth + 1 : 0);
    const plain = (text: string): number => text.replace(/\{[^}]*\}/g, '').length;
    const line = (dropped: number): string =>
      pieces.filter(p => p.drop > dropped).map(p => p.text).join('');

    let dropped = 0;
    while (plain(line(dropped)) > room && dropped < 5) dropped++;
    this.statusBar.setContent(line(dropped));
  }

  private updateToolbar(): void {
    // F-key toolbar is now separate, no need for old toolbar
    // Update F-key toolbar if it exists
    if (this.fkeyToolbar) {
      this.updateFkeyToolbar();
    }
    // Update sidebar tool selection
    if (this.sidebar) {
      this.updateSidebarToolSelection();
    }
  }

  private async save(): Promise<void> {
    if (!this.onSaveCallback) return;

    let content: string;
    if (this.mode === 'draw') {
      // Get content from Canvas widget
      content = (this.drawCanvas as any).getContent();
    } else {
      content = this.lines.join('\n');
    }

    const success = await this.onSaveCallback(content);

    if (success) {
      this.modified = false;
      this.updateDisplay();
    }
  }

  private confirmExit(): void {
    if (!this.screen) {
      if (this.onExitCallback) this.onExitCallback();
      return;
    }

    // Hide the cursor overlay while dialog is shown
    this.drawCursor.hide();
    this.modalOpen = true;

    // Track if we should exit or return to editing
    let shouldExit = false;

    // Use SDK ConfirmModal for proper input handling
    const modal = new ConfirmModal({
      parent: this.screen,
      title: 'Unsaved Changes',
      message: 'You have unsaved changes.\n\nSave: Save and exit\nDiscard: Exit without saving\nESC: Cancel and continue editing',
      confirmText: '[ Save ]',
      cancelText: '[ Discard ]',
      confirmColor: 'green',
      cancelColor: 'red',
      borderColor: 'yellow',
      overlay: true,
      style: {
        fg: 'white',
        bg: 'black',
      },
      onConfirm: () => {
        shouldExit = true;
        modal.destroy();
        this.save().then(() => {
          if (this.onExitCallback) this.onExitCallback();
        }).catch(console.error);
      },
      onCancel: () => {
        shouldExit = true;
        modal.destroy();
        if (this.onExitCallback) this.onExitCallback();
      },
    });

    // Override ESC to cancel and return to editing (not exit)
    modal.key(['escape'], () => {
      if (!shouldExit) {
        modal.hide();
        modal.destroy();
        this.restoreFocusAfterDialog();
      }
      return true; // Prevent default ESC handling
    });

    modal.display();
  }

  /**
   * Give a modal the keyboard and KEEP it.
   *
   * focus() alone loses to the click that opened it: the same mouse
   * dispatch carries on to the elements underneath and the canvas takes
   * focus straight back, so Tab, Enter and Escape never reach the dialog -
   * "sauce info does nothing" (2026-09-02), which is the same fault the
   * sprite studio's own requesters had. A trap reasserts itself whenever
   * focus lands outside it.
   */
  private takeModalFocus(el: any): void {
    this.modalTrap = el;
    el.focus();
    (this.screen as any)?.trapFocus?.(el);
  }

  private restoreFocusAfterDialog(): void {
    if (this.modalTrap) {
      (this.screen as any)?.releaseFocusTrap?.(this.modalTrap);
      this.modalTrap = undefined;
    }

    // Defer clearing modal flag so ESC handler still sees it as true
    // (ESC both closes modal AND triggers exit handler - we need exit handler to see modalOpen=true)
    setImmediate(() => {
      this.modalOpen = false;
    });

    // Show cursor overlay again if in draw mode
    if (this.mode === 'draw') {
      this.drawCursor.show();
      this.updateDrawCursor();
      this.drawCanvas.focus();
    } else {
      this.viewport.focus();
    }
    this.updateStatusBar();
    this.screen?.render();
  }

  private showColorPicker(isForeground: boolean): void {
    if (!this.screen || this.modalOpen) return;

    this.drawCursor.hide();
    this.modalOpen = true;

    // 16 ANSI colors in order
    const colorCodes = [
      'black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white',
      'gray', 'lightred', 'lightgreen', 'lightyellow', 'lightblue', 'lightmagenta', 'lightcyan', 'lightwhite',
    ];

    let selectedFg = this.currentFg;
    let selectedBg = this.currentBg;
    let editingFg = isForeground;  // Which row is active

    // Create overlay for dimming background
    const overlay = new Overlay({
      parent: this.screen,
      opacity: 0.5,
    });

    // Modal with both FG and BG rows
    // Layout: FG label + 2 rows, BG label + 2 rows
    const modal = new Box({
      parent: overlay,
      top: 'center',
      left: 'center',
      width: 22,
      height: 10,
      border: { type: 'line' },
      label: ' Colors ',
      tags: true,
      keys: true,
      mouse: true,
      ch: ' ',
      style: { fg: 'white', bg: 'black', border: { fg: 'cyan' } },
    });

    // FG Label
    new Text({
      parent: modal,
      top: 0,
      left: 0,
      content: 'FG',
      style: { fg: editingFg ? 'cyan' : 'gray', bold: editingFg },
    });

    // BG Label
    new Text({
      parent: modal,
      top: 4,
      left: 0,
      content: 'BG',
      style: { fg: !editingFg ? 'cyan' : 'gray', bold: !editingFg },
    });

    // Create FG swatches (rows 0-1, offset by 3 for label)
    const fgSwatches: Box[] = [];
    for (let i = 0; i < 16; i++) {
      const row = Math.floor(i / 8);
      const col = i % 8;
      const isSelected = i === selectedFg;
      const swatch = new Box({
        parent: modal,
        top: row + 1,
        left: col * 2 + 3,
        width: 2,
        height: 1,
        mouse: true,
        content: '  ',
        style: { bg: colorCodes[i], inverse: isSelected },
      });
      swatch.on('click', () => {
        selectedFg = i;
        editingFg = true;
        updateSelection();
      });
      fgSwatches.push(swatch);
    }

    // Create BG swatches (rows 4-5)
    const bgSwatches: Box[] = [];
    for (let i = 0; i < 16; i++) {
      const row = Math.floor(i / 8);
      const col = i % 8;
      const isSelected = i === selectedBg;
      const swatch = new Box({
        parent: modal,
        top: row + 5,
        left: col * 2 + 3,
        width: 2,
        height: 1,
        mouse: true,
        content: '  ',
        style: { bg: colorCodes[i], inverse: isSelected },
      });
      swatch.on('click', () => {
        selectedBg = i;
        editingFg = false;
        updateSelection();
      });
      bgSwatches.push(swatch);
    }

    const fgLabel = modal.children[0] as Text;
    const bgLabel = modal.children[1] as Text;

    const updateSelection = () => {
      // Update FG swatches
      fgSwatches.forEach((s, i) => {
        (s.style as any).inverse = (i === selectedFg);
      });
      // Update BG swatches
      bgSwatches.forEach((s, i) => {
        (s.style as any).inverse = (i === selectedBg);
      });
      // Update labels to show which is active
      (fgLabel.style as any).fg = editingFg ? 'cyan' : 'gray';
      (bgLabel.style as any).fg = !editingFg ? 'cyan' : 'gray';
      this.screen?.render();
    };

    const trapCleanup = trapModalInput(modal);

    const closeDialog = (save: boolean) => {
      trapCleanup();
      overlay.destroy();
      if (save) {
        this.currentFg = selectedFg;
        this.currentBg = selectedBg;
      }
      this.restoreFocusAfterDialog();
    };

    // Keyboard navigation
    const currentIdx = () => editingFg ? selectedFg : selectedBg;
    const setIdx = (idx: number) => {
      if (editingFg) selectedFg = idx;
      else selectedBg = idx;
    };

    modal.key(['left', 'h'], () => {
      setIdx(currentIdx() > 0 ? currentIdx() - 1 : 15);
      updateSelection();
    });
    modal.key(['right', 'l'], () => {
      setIdx(currentIdx() < 15 ? currentIdx() + 1 : 0);
      updateSelection();
    });
    modal.key(['up', 'k'], () => {
      const idx = currentIdx();
      if (editingFg && idx >= 8) {
        setIdx(idx - 8);
      } else if (editingFg && idx < 8) {
        // Move to BG row
        editingFg = false;
        selectedBg = idx + 8;
      } else if (!editingFg && idx >= 8) {
        setIdx(idx - 8);
      } else {
        // Move to FG row
        editingFg = true;
        selectedFg = idx + 8;
      }
      updateSelection();
    });
    modal.key(['down', 'j'], () => {
      const idx = currentIdx();
      if (editingFg && idx < 8) {
        setIdx(idx + 8);
      } else if (editingFg && idx >= 8) {
        // Move to BG row
        editingFg = false;
        selectedBg = idx - 8;
      } else if (!editingFg && idx < 8) {
        setIdx(idx + 8);
      } else {
        // Move to FG row
        editingFg = true;
        selectedFg = idx - 8;
      }
      updateSelection();
    });
    modal.key(['tab'], () => {
      editingFg = !editingFg;
      updateSelection();
    });
    modal.key(['enter', 'space'], () => closeDialog(true));
    modal.key(['escape', 'q'], () => closeDialog(false));
    overlay.on('cancel', () => closeDialog(false));

    overlay.show();
    this.takeModalFocus(modal);
    this.screen.render();
  }

  private showCharacterPicker(): void {
    if (!this.screen || this.modalOpen) return;

    this.drawCursor.hide();
    this.modalOpen = true;

    const charSets = [
      { label: 'Blocks', chars: ['█', '▓', '▒', '░', '▀', '▄', '▌', '▐'] },
      { label: 'Boxes', chars: ['■', '□', '▪', '▫', '◼', '◻', '▬', '▭'] },
      { label: 'Circles', chars: ['●', '○', '◉', '◎', '•', '◦', '◐', '◑'] },
      { label: 'Lines', chars: ['─', '│', '┌', '┐', '└', '┘', '├', '┤'] },
      { label: 'Symbols', chars: ['/', '\\', '|', '-', '+', '*', '#', '@'] },
      { label: 'Arrows', chars: ['←', '→', '↑', '↓', '↔', '↕', '◄', '►'] },
    ];

    const allChars = charSets.flatMap(s => s.chars);

    // Create overlay for dimming background
    const overlay = new Overlay({
      parent: this.screen,
      opacity: 0.5,
    });

    // Create modal box - fixed height with scrollable list
    const modal = new Box({
      parent: overlay,
      top: 'center',
      left: 'center',
      width: 30,
      height: 16,  // Fixed height - list will scroll
      border: { type: 'line' },
      label: ' Character ',
      tags: true,
      keys: true,
      mouse: true,
      ch: ' ',
      style: { fg: 'white', bg: 'blue', border: { fg: 'magenta' } },
    });

    // Create list for character selection
    const items = allChars.map((char, idx) => {
      const set = charSets.find(s => s.chars.includes(char));
      return `${char}  ${set?.label || 'Other'}`;
    });

    const list = new List({
      parent: modal,
      top: 0,
      left: 0,
      width: '100%-2',
      height: '100%-2',
      items,
      mouse: true,
      keys: true,
      tags: true,
      scrollable: true,
      scrollbar: {
        ch: ' ',
        style: { bg: 'magenta' },
      },
      style: {
        fg: 'white',
        bg: 'blue',
        selected: { fg: 'black', bg: 'magenta' },
      },
    });

    const currentIdx = allChars.indexOf(this.currentChar);
    if (currentIdx >= 0) list.select(currentIdx);

    const trapCleanup = trapModalInput(modal);

    const closeDialog = (selectedChar?: string) => {
      trapCleanup();
      overlay.destroy();
      if (selectedChar) {
        this.currentChar = selectedChar;
      }
      this.restoreFocusAfterDialog();
    };

    list.on('select', (_item: any, idx: number) => closeDialog(allChars[idx]));
    list.key(['escape', 'q'], () => closeDialog());
    overlay.on('cancel', () => closeDialog());

    overlay.show();
    this.takeModalFocus(list);
    this.screen.render();
  }

  private showHelp(): void {
    if (!this.screen || this.modalOpen) return;

    // Hide the cursor overlay while dialog is shown
    this.drawCursor.hide();
    this.modalOpen = true;

    const helpText = `{cyan-fg}{bold}MOEBIUS-STYLE ANSI EDITOR{/bold}{/cyan-fg}

{yellow-fg}{bold}INTERFACE:{/bold}{/yellow-fg}
  Menu Bar       File/Edit/Layer/Select/Colors/View/Help
  F-Key Toolbar  F1-F12 character sets (< > to change set)
  Left Sidebar   Colors + Tools + Layers
  Status Bar     Position, colors, tool, layer, iCE mode

{yellow-fg}{bold}F-KEYS (Character Selection):{/bold}{/yellow-fg}
  F1-F12         Select character from current set
  Shift+F-key    Change to next character set
  < > buttons    Previous/next character set

{yellow-fg}{bold}COLOR SELECTION:{/bold}{/yellow-fg}
  Left Click     Select foreground color from palette
  Right Click    Select background color from palette
  Alt+C          Open foreground color picker
  Alt+B          Open background color picker

{yellow-fg}{bold}TOOLS (use sidebar or keyboard):{/bold}{/yellow-fg}
  T              Text mode (type characters)
  D              Draw tool (freehand)
  L              Line tool (click two points)
  R              Rectangle tool
  E              Ellipse tool
  F              Fill tool (flood fill)
  P              Pick tool (sample color/char)
  S              Select tool

{yellow-fg}{bold}LAYERS:{/bold}{/yellow-fg}
  Layer menu     Add, delete, merge, move layers
  Sidebar +/-    Add/delete layer
  Sidebar M      Merge down
  Left Click     Select layer
  Right Click    Toggle layer visibility
  * = visible    L = locked

{yellow-fg}{bold}NAVIGATION:{/bold}{/yellow-fg}
  Arrow Keys     Move cursor
  Enter          Move to next line
  Backspace      Erase and move left

{yellow-fg}{bold}DRAWING:{/bold}{/yellow-fg}
  Type any key   Place character (in text mode)
  Space          Draw with current tool
  Left Click     Draw at position
  Right Click    Erase at position
  Mouse Drag     Continuous draw/erase

{yellow-fg}{bold}EDITING:{/bold}{/yellow-fg}
  Ctrl+Z         Undo
  Ctrl+Y         Redo
  Ctrl+S         Save
  Ctrl+M         Toggle Text/Draw mode
  U              Undo (in draw mode)

{yellow-fg}{bold}FILE:{/bold}{/yellow-fg}
  SAUCE Info     Edit SAUCE metadata (title, author, group)
  iCE Colors     Toggle 16 BG colors (vs 8 + blink)

{yellow-fg}{bold}VIEW:{/bold}{/yellow-fg}
  F2             Toggle fullscreen (hide/show UI)
  ?              This help screen
  ESC            Exit editor

{yellow-fg}{bold}TIPS:{/bold}{/yellow-fg}
  - F-keys select from 8 character sets
  - Layers let you work on separate elements
  - SAUCE metadata is saved with the file
  - iCE colors enable 16 background colors
`;

    // Use DocModal widget for proper help display
    const helpModal = new DocModal({
      parent: this.screen,
      title: 'ANSI Editor Help',
      content: helpText,
      closeKeys: ['escape', 'q', '?', 'enter', 'space'],
      footerText: '{bold} Scroll: Arrows/PgUp/PgDn | Close: ESC/Q/?/Enter {/bold}',
      style: {
        fg: 'white',
        bg: 'blue',
        border: { fg: 'cyan' },
      },
      contentStyle: {
        fg: 'white',
        bg: 'blue',  // Match modal background for transparent look
      },
      onClose: () => {
        helpModal.destroy();
        this.restoreFocusAfterDialog();  // This sets modalOpen = false
      },
    });

    // Display the modal, with focusOnClose pointing to the right widget
    const focusTarget = this.mode === 'draw' ? this.drawCanvas : this.viewport;
    helpModal.display(focusTarget);
  }

  private saveUndoState(): void {
    this.undoStack.push(this.lines.join('\n'));
    if (this.undoStack.length > 100) {
      this.undoStack.shift();
    }
    this.redoStack = [];
  }

  /**
   * Ctrl+Z / U. In draw mode, routes to the library's per-instance
   * undoDrawing() (see task-4-report.md) instead of the text-mode
   * this.undoStack, which draw-mode operations never populate.
   *
   * flushDrawChunk() runs FIRST (IMPORTANT 3): a chunk opened by
   * drawTool.onStart/paintCell(..., true) is normally flushed on mouseup,
   * but a mouseup can be missed (pointer leaves the canvas mid-drag). If
   * Ctrl+Z were pressed in that window, undoDrawing() would pop the
   * PREVIOUS entry while the stroke's own snapshot still sits pending, and
   * that stale snapshot would land later whenever mouseup does fire -
   * silently reappearing after the user thought they'd undone past it.
   * Flushing here first is a no-op when nothing is chunked, so it's safe
   * unconditionally.
   */
  private undo(): void {
    if (this.mode === 'draw') {
      this.flushDrawChunk();
      if (this.coreState && undoDrawing(this.coreState)) {
        this.syncFromCoreState();
        if (this.screen) {
          this.screen.render();
        }
      }
      return;
    }

    if (this.undoStack.length > 1) {
      const current = this.undoStack.pop()!;
      this.redoStack.push(current);
      const previous = this.undoStack[this.undoStack.length - 1];
      this.lines = previous.split('\n');
      this.modified = true;
      this.updateDisplay();
    }
  }

  /** Ctrl+Y. Draw-mode counterpart of undo() above, via redoDrawing(). */
  private redo(): void {
    if (this.mode === 'draw') {
      if (this.coreState && redoDrawing(this.coreState)) {
        this.syncFromCoreState();
        if (this.screen) {
          this.screen.render();
        }
      }
      return;
    }

    if (this.redoStack.length > 0) {
      const next = this.redoStack.pop()!;
      this.undoStack.push(next);
      this.lines = next.split('\n');
      this.modified = true;
      this.updateDisplay();
    }
  }

  /**
   * Get current content
   */
  getContent(): string {
    if (this.mode === 'draw') {
      // Use core library to convert canvas to ANSI
      if (this.cellCanvas) {
        return CoreCanvas.canvasToANSI(this.cellCanvas);
      }
      // Fallback to Canvas widget content
      return (this.drawCanvas as any).getContent();
    } else {
      return this.lines.join('\n');
    }
  }

  /**
   * Get the core canvas (Cell[][]) for advanced operations
   */
  getCoreCanvas(): Cell[][] | null {
    return this.cellCanvas;
  }

  /**
   * Set the core canvas directly. Size-safe: adoptCellCanvas() keeps the
   * active layer's canvas reference in sync (it would otherwise go stale,
   * pointing at the old canvas while this.cellCanvas points at the new one)
   * and clears coreState's draw-mode undo history (a host swapping in a
   * different frame - e.g. the sprite editor's frame-swap use case this
   * method exists for - is a new undo timeline, not a continuation of the
   * old canvas's; see adoptCellCanvas()'s doc comment for the full
   * reasoning). Also clamps the cursor and any live selection into the new
   * canvas's bounds so neither can end up referencing cells that no longer
   * exist.
   */
  setCoreCanvas(canvas: Cell[][]): void {
    this.adoptCellCanvas(canvas);

    // this.canvasW/canvasH now reflect the newly-assigned canvas.
    this.clampCursorToCanvas();
    if (this.selection) {
      this.selection = {
        x1: this.clampCol(this.selection.x1),
        y1: this.clampLine(this.selection.y1),
        x2: this.clampCol(this.selection.x2),
        y2: this.clampLine(this.selection.y2),
      };
    }

    this.syncCoreCanvasToDisplay();
    this.modified = true;
    this.updateDisplay();
  }

  /**
   * Check if content has been modified
   */
  isModified(): boolean {
    return this.modified;
  }

  /**
   * Set content - parses ANSI and updates both text lines and cell canvas
   */
  setContent(content: string): void {
    this.lines = content.split('\n');
    this.cursor = { line: 0, col: 0 };

    // Clear and repopulate the cell canvas from ANSI content
    if (this.cellCanvas) {
      CoreCanvas.clearCanvas(this.cellCanvas);
      CoreCanvas.parseANSIToCanvas(this.cellCanvas, content);
      this.syncCoreCanvasToDisplay();
    }

    this.modified = false;
    this.saveUndoState();
    this.updateDisplay();
  }
}

/**
 * Helper function to create ANSIEditor
 */
export function ansiEditor(options: ANSIEditorOptions = {}): ANSIEditor {
  return new ANSIEditor(options);
}
