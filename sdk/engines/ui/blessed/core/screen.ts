/**
 * Screen class - Root container and rendering manager
 */

import { Element } from './element';
import { Program } from './program';
import { cursor, screen as screenAnsi, attrs, blend, parseTags, stripAnsi } from './colors';
import { KeyBindings } from './keybindings';
import { ResponsiveLayoutManager, type ResponsiveConfig } from './responsive-layout';
import type { ScreenOptions, KeyEvent, MouseEvent } from './types';

// Use String.fromCharCode(27) for ESC to survive Terser minification
// Terser strips literal \x1b from string constants
const ESC = String.fromCharCode(27);

export class Screen extends Element {
  declare options: ScreenOptions;
  private _width: number;
  private _height: number;
  declare focused: boolean;
  private _focused: Element | null = null;

  // Program instance for terminal control
  program: Program;

  // Output callback (deprecated - use program instead)
  private output: (data: string) => void;

  // Focus history
  private focusHistory: Element[] = [];
  private focusStack: Element[] = []; // Stack for pushing/popping focus (modals)
  private savedFocus: Element | null = null;

  // Focus trapping (for modals)
  private focusTrap: Element | null = null;

  // Rendering state
  // Buffer format: [y][x] = [attr, char]
  // attr is 27-bit packed: (flags << 18) | (fg << 9) | bg
  private buffer: [number, string][][] = [];
  private lastBuffer: [number, string][][] = [];
  private dirty: boolean = true;

  // Render batching (Opt #1: 70-80% reduction in render calls)
  private _renderPending: boolean = false;
  private _renderTimer: any = null;

  // Dirty region tracking (Opt #5: 50-60% reduction in diff cells)
  private _dirtyMinX: number = Infinity;
  private _dirtyMinY: number = Infinity;
  private _dirtyMaxX: number = -Infinity;
  private _dirtyMaxY: number = -Infinity;

  // Spatial mouse index (Opt #7: O(1) vs O(n) mouse hit testing)
  private _mouseIndex: Element[][][] = [];  // [y][x] = elements at that position
  private _mouseIndexValid: boolean = false;

  // Track currently hovered elements (Opt #27: Avoid O(n) tree walk)
  private _hoveredElements: Set<Element> = new Set();

  // Title
  private title: string = '';

  // Cursor state
  private cursorHidden: boolean = true;
  private cursorX: number = 0;
  private cursorY: number = 0;
  private _cursorStyle: string = 'default';  // CSS cursor style for web frontend

  // Drag tracking (EXACT from neo-blessed screen.js)
  private _dragging: Element | null = null;

  // Key handlers
  private keyHandlers: Map<string, ((ch: any, key: KeyEvent) => boolean | void)[]> = new Map();

  // Global keyboard shortcuts
  public keyBindings: KeyBindings = new KeyBindings();

  // Browser context menu handler (stored for cleanup)
  private _contextMenuHandler: ((e: Event) => void) | null = null;

  // Responsive layout manager
  public responsiveLayout: ResponsiveLayoutManager;

  // Responsive mode - allows wider than 80 columns
  private _responsive: boolean = false;

  private _locked: boolean = false;

  // Optimized rendering for slow connections (modem/telnet)
  // When enabled, only redraws changed elements instead of full screen clear
  // Enabled by default - safe because first render is always full, and elements auto-mark dirty
  private _optimizedRendering: boolean = true;
  private _dirtyElements: Set<Element> = new Set();
  private _fullRedrawNeeded: boolean = true;

  // Slow connection mode - uses TRUE differential rendering (only changed cells are output)
  // When enabled, does NOT invalidate lastBuffer on each render, dramatically reducing output
  // Perfect for modem emulation where every byte counts
  private _slowConnectionMode: boolean = false;

  constructor(options: ScreenOptions & { input?: any; output?: (data: string) => void; responsive?: boolean } = {}) {
    // BBS Terminal Constraints (when not in responsive mode):
    // - Width: 80 columns (classic BBS standard)
    // - Height: 24 rows (classic BBS standard)
    // In responsive mode, use provided dimensions or defaults
    const bbsWidth = options.responsive ? (options.width || 80) : 80;
    const bbsHeight = options.responsive
      ? (options.height || 24)
      : Math.min(options.height || 24, 25);

    const style = { ...(options.style || {}) };
    if (style.bg === undefined) {
      style.bg = 'black';
    }

    super({
      ...options,
      style,
      left: 0,
      top: 0,
      width: bbsWidth,
      height: bbsHeight,
    });

    this._width = bbsWidth;
    this._height = bbsHeight;
    this._responsive = options.responsive || false;
    this.screen = this;

    console.log(`[Screen] Created: ${bbsWidth}x${bbsHeight}, responsive=${this._responsive}, options.width=${options.width}, options.height=${options.height}`);

    // Set output callback (for backward compatibility)
    this.output = options.output || ((data: string) => {
      if (typeof process !== 'undefined' && process.stdout) {
        process.stdout.write(data);
      }
    });

    // Create Program instance
    this.program = new Program({
      input: options.input,
      output: this.output,
      terminal: options.terminal || 'ansi',
      buffer: true,
      title: options.title,
    });

    // Set dimensions on program
    this.program.cols = this._width;
    this.program.rows = this._height;

    // Initialize buffers
    this.clearBuffers();

    // Set title
    if (options.title) {
      this.setTitle(options.title);
    }

    // Hide cursor by default
    if (this.cursorHidden) {
      this.write(cursor.hide);
    }

    // Initialize responsive layout manager
    const responsiveConfig: ResponsiveConfig = {
      enableAutoResize: options.responsive !== false,
      breakpoints: options.breakpoints,
    };
    this.responsiveLayout = new ResponsiveLayoutManager(this, responsiveConfig);

    // Setup event routing from program to screen/elements
    this.setupKeyRouting();
    this.setupMouseRouting();

    // In browser environment, prevent browser context menu to allow app to use right-click
    this.setupBrowserContextMenu();
  }

  /**
   * Setup browser context menu prevention
   * This allows SDK doors to use right-click without the browser menu appearing
   */
  private setupBrowserContextMenu(): void {
    // Only setup in browser environment
    // Use typeof check to avoid TypeScript errors in Node.js compilation
    const win = typeof globalThis !== 'undefined' ? (globalThis as any).window : undefined;
    const doc = typeof globalThis !== 'undefined' ? (globalThis as any).document : undefined;

    if (!win || !doc) {
      return;
    }

    // Create handler that prevents the browser context menu
    this._contextMenuHandler = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      return false;
    };

    // Add to document to catch all context menu events
    doc.addEventListener('contextmenu', this._contextMenuHandler, true);
  }

  // ============================================================================
  // Key Event Routing
  // ============================================================================

  /**
   * Setup key event routing from Program to Screen
   */
  private setupKeyRouting(): void {
    // Remove existing listeners to prevent duplication if Program is reused
    this.program.removeAllListeners('keypress');
    
    // Listen to Program's keypress events
    this.program.on('keypress', (ch: any, key: KeyEvent) => {
      this._handleKey(ch, key);
    });
  }

  // ============================================================================
  // Mouse Event Routing
  // ============================================================================

  /**
   * Setup mouse event routing from Program to Elements
   */
  private setupMouseRouting(): void {
    // Listen to Program's mouse events
    this.program.on('mouse', (event: MouseEvent) => {
      this.handleMouseEvent(event);
    });
  }

  /**
   * Handle mouse event and route to appropriate elements
   */
  private handleMouseEvent(event: MouseEvent): void {
    // Emit on screen first (generic mouse event and specific action event)
    this.emit('mouse', event);
    this.emit(event.action, event);

    // If we're currently dragging an element, route events EXCLUSIVELY to it
    // This prevents dragging foreground elements from triggering background hover/clicks
    if (this._dragging) {
      this._dragging.onMouse(event);
      return;
    }

    // Find all elements under the mouse cursor
    const elements = this.getElementsAt(event.x, event.y);

    // Current hovered elements (use Set for O(1) lookups)
    const currentHovered = new Set(elements);

    // Emit mouseleave for elements no longer hovered
    // Use tracked set instead of O(n) tree walk
    for (const el of this._hoveredElements) {
      if (!currentHovered.has(el)) {
        el.onMouseLeave();
        this._hoveredElements.delete(el);
      }
    }

    // Add newly hovered elements to tracking set
    for (const el of elements) {
      if (!this._hoveredElements.has(el)) {
        this._hoveredElements.add(el);
      }
    }

    // Route event to elements (from top to bottom in z-order)
    // Use slice().reverse() to avoid mutating the elements array
    for (const element of elements.slice().reverse()) {
      if (element.onMouse(event)) {
        // Event was handled by this element, stop propagation
        // This prevents dragging foreground elements from also dragging background elements
        break;
      }
    }

    // Update cursor style based on hovered elements
    this.updateCursorStyleForHover(elements, event);
  }

  /**
   * Determine and set the appropriate cursor style based on hovered elements
   */
  private updateCursorStyleForHover(elements: Element[], event: MouseEvent): void {
    // Check elements from top to bottom (reversed = front to back)
    for (const el of elements.slice().reverse()) {
      // Check if element has explicit cursor style
      if (el.options.cursorStyle) {
        this.setCursorStyle(el.options.cursorStyle);
        return;
      }

      // Check for resize edge on resizable elements
      if ((el as any).detectResizeEdge) {
        const edge = (el as any).detectResizeEdge(event.x, event.y);
        if (edge) {
          const cursorMap: Record<string, string> = {
            'n': 'ns-resize',
            's': 'ns-resize',
            'e': 'ew-resize',
            'w': 'ew-resize',
            'nw': 'nwse-resize',
            'se': 'nwse-resize',
            'ne': 'nesw-resize',
            'sw': 'nesw-resize',
          };
          this.setCursorStyle(cursorMap[edge] || 'default');
          return;
        }
      }

      // Determine cursor from element type/properties
      const cursorStyle = this.getCursorStyleForElement(el);
      if (cursorStyle !== 'default') {
        this.setCursorStyle(cursorStyle);
        return;
      }
    }

    // Default cursor if no special elements
    this.setCursorStyle('default');
  }

  /**
   * Get appropriate cursor style for an element based on its type and properties
   */
  private getCursorStyleForElement(el: Element): string {
    // Check element type name
    const typeName = el.constructor.name.toLowerCase();

    // Buttons get pointer cursor
    if (typeName === 'button' || (el as any)._isButton) {
      return 'pointer';
    }

    // Text inputs get text cursor
    if (typeName === 'textbox' || typeName === 'textarea' || typeName === 'input') {
      return 'text';
    }

    // Draggable elements (title bars) get grab cursor
    if (el.options.draggable && !(el as any).isResizing && !(el as any).isDragging) {
      return 'grab';
    }

    // Currently dragging elements get grabbing cursor
    if ((el as any).isDragging) {
      return 'grabbing';
    }

    // Clickable elements get pointer
    if (el.options.clickable || el.options.mouse) {
      return 'pointer';
    }

    // Scrollable elements (might need scroll indicators)
    if (el.options.scrollable) {
      return 'default';
    }

    return 'default';
  }

  // Opt #7: Rebuild spatial mouse index (O(1) lookups vs O(n) tree walks)
  private _rebuildMouseIndex(): void {
    // Initialize 2D grid
    this._mouseIndex = [];
    for (let y = 0; y < this.height; y++) {
      this._mouseIndex[y] = [];
      for (let x = 0; x < this.width; x++) {
        this._mouseIndex[y][x] = [];
      }
    }

    // Walk tree and add elements to their grid cells
    this.walk((el) => {
      if (el.hidden || !el.visible) return;

      const coords = el._getCoords();
      if (!coords) return;

      // Add element to all cells it occupies
      for (let y = Math.max(0, coords.yi); y < Math.min(this.height, coords.yl); y++) {
        for (let x = Math.max(0, coords.xi); x < Math.min(this.width, coords.xl); x++) {
          this._mouseIndex[y][x].push(el);
        }
      }
    });

    this._mouseIndexValid = true;
  }

  /**
   * Invalidate mouse index when elements move or change
   * Called by Element when positions change
   */
  invalidateMouseIndex(): void {
    this._mouseIndexValid = false;
  }

  /**
   * Get all elements at screen coordinates
   */
  private getElementsAt(x: number, y: number): Element[] {
    // Opt #7: Use spatial index if valid
    if (this._mouseIndexValid && y >= 0 && y < this.height && x >= 0 && x < this.width) {
      // CRITICAL: Return a copy to prevent caller from mutating internal index with .reverse()
      return [...(this._mouseIndex[y][x] || [])];
    }

    // Fallback to tree walk if index not built yet
    const elements: Element[] = [];

    this.walk((el) => {
      if (el.hasMouseOver(x, y) && !el.hidden && el.visible) {
        elements.push(el);
      }
    });

    return elements;
  }

  /**
   * Walk the element tree
   */
  private walk(callback: (el: Element) => void): void {
    const visit = (el: Element) => {
      callback(el);
      for (const child of el.children) {
        visit(child);
      }
    };

    for (const child of this.children) {
      visit(child);
    }
  }

  /**
   * Enable mouse support on screen
   */
  enableMouse(): void {
    this.program.enableMouse();
  }

  /**
   * Disable mouse support on screen
   */
  disableMouse(): void {
    this.program.disableMouse();
  }

  // ============================================================================
  // Output
  // ============================================================================

  private write(data: string): void {
    this.program.write(data);
  }

  /**
   * Get the rendered ANSI output from the program buffer
   */
  getOutput(): string {
    const output = (this.program as any)._buf || '';
    (this.program as any)._buf = ''; // Clear buffer after reading
    return output;
  }

  // ============================================================================
  // BBS Terminal Dimensions
  // ============================================================================

  /**
   * Set screen dimensions based on user configuration
   * BBS Constraints (non-responsive mode):
   * - Width: 80 columns (classic BBS standard)
   * - Height: User-configurable (default 23 content + 2 prompts = 25 total max)
   *
   * @param linesPerScreen User's configured lines per screen (default 23)
   * @param width Optional width (only used in responsive mode)
   */
  setDimensions(linesPerScreen?: number, width?: number): void {
    // Validate inputs
    if (linesPerScreen !== undefined && (!isFinite(linesPerScreen) || linesPerScreen <= 0)) {
      return;
    }
    if (width !== undefined && (!isFinite(width) || width <= 0)) {
      return;
    }

    // In responsive mode, use provided width; otherwise 80 columns
    const bbsWidth = this._responsive ? (width || this._width) : 80;
    const contentLines = this._responsive
      ? (linesPerScreen || this._height)
      : Math.min(linesPerScreen || 23, 23);
    const bbsHeight = this._responsive ? contentLines : (contentLines + 2);

    this._width = bbsWidth;
    this._height = bbsHeight;
    this.program.cols = bbsWidth;
    this.program.rows = bbsHeight;

    // Reinitialize buffers with new dimensions
    this.clearBuffers();

    // Invalidate all element coordinate caches after dimension change
    this.walk((el) => {
      (el as any)._coordsCacheValid = false;
    });

    this.dirty = true;
  }

  /**
   * Get current screen dimensions
   */
  getDimensions(): { width: number; height: number } {
    return {
      width: this._width,
      height: this._height
    };
  }

  /**
   * Flush buffered output
   */
  flush(): void {
    this.program.flush();
  }

  // ============================================================================
  // Buffer Management
  // ============================================================================

  private clearBuffers(): void {
    this.buffer = [];
    this.lastBuffer = [];

    for (let y = 0; y < this.height; y++) {
      this.buffer[y] = [];
      this.lastBuffer[y] = [];

      for (let x = 0; x < this.width; x++) {
        // Default: no attributes (0x000), space character
        this.buffer[y][x] = [0x000, ' '];
        this.lastBuffer[y][x] = [0x000, ' '];
      }
    }
  }

  /**
   * Force a full screen redraw on the next render by invalidating lastBuffer.
   * This ensures all cells are output to the terminal, which is useful after
   * destroying dialogs or overlays where remnants might otherwise persist.
   *
   * Call this before render() when transitioning between dialogs/overlays.
   */
  forceFullRedraw(): void {
    // Mark entire screen as dirty so _diff() processes all cells
    this._markDirty(0, 0, this.width - 1, this.height - 1);

    // Set lastBuffer to an impossible state (attr=-1) so _diff will output all cells
    // Use buffer dimensions to handle any buffer/screen dimension mismatch
    const bufHeight = this.buffer.length;
    const bufWidth = bufHeight > 0 ? this.buffer[0].length : 0;
    for (let y = 0; y < bufHeight; y++) {
      if (!this.lastBuffer[y]) continue;
      for (let x = 0; x < bufWidth; x++) {
        // Guard: check cell exists
        if (!this.lastBuffer[y][x]) continue;
        this.lastBuffer[y][x] = [-1, '\x00'];
      }
    }
  }

  /**
   * Allocate (create) a new blank buffer
   */
  alloc(): [number, string][][] {
    const buf: [number, string][][] = [];
    for (let y = 0; y < this.height; y++) {
      buf[y] = [];
      for (let x = 0; x < this.width; x++) {
        buf[y][x] = [0x000, ' '];
      }
    }
    return buf;
  }

  /**
   * Reallocate buffers (called on resize)
   */
  realloc(): void {
    const obuf = this.buffer;
    const oline = this.lastBuffer;

    this.buffer = this.alloc();
    this.lastBuffer = this.alloc();

    // Copy old content
    for (let y = 0; y < Math.min(this.height, obuf.length); y++) {
      for (let x = 0; x < Math.min(this.width, obuf[y].length); x++) {
        this.buffer[y][x] = obuf[y][x];
        this.lastBuffer[y][x] = oline[y][x];
      }
    }
  }

  /**
   * Lock the screen to prevent rendering during batch updates
   */
  lock(): void {
    this._locked = true;
  }

  /**
   * Unlock the screen and trigger a coordinated render
   */
  unlock(): void {
    this._locked = false;
    this.render();
  }

  /**
   * Enable optimized rendering for slow connections (modem/telnet)
   * This mode only redraws changed elements instead of clearing the full screen
   */
  enableOptimizedRendering(): void {
    this._optimizedRendering = true;
    this._fullRedrawNeeded = true;  // First render should be full
  }

  /**
   * Disable optimized rendering (use full screen redraws)
   */
  disableOptimizedRendering(): void {
    this._optimizedRendering = false;
  }

  /**
   * Check if optimized rendering is enabled
   */
  isOptimizedRenderingEnabled(): boolean {
    return this._optimizedRendering;
  }

  /**
   * Mark an element as needing redraw (for optimized rendering)
   */
  markDirtyElement(element: Element): void {
    this._dirtyElements.add(element);
    // Also mark the element's bounding box as dirty
    const pos = element._getCoords();
    if (pos) {
      this._markDirty(pos.xi, pos.yi, pos.xl - 1, pos.yl - 1);
    }
  }

  /**
   * Request a full redraw on next render (for optimized rendering)
   */
  requestFullRedraw(): void {
    this._fullRedrawNeeded = true;
  }

  /**
   * Enable slow connection mode for modem emulation
   *
   * When enabled, uses TRUE differential rendering - only cells that have
   * actually changed are output to the terminal. This dramatically reduces
   * output volume, making blessed usable with modem speed emulation.
   *
   * Normal mode: ~1920 characters per render (full screen)
   * Slow mode: ~50-200 characters per render (only changes)
   *
   * Call this when modem emulation is active (bps > 0).
   */
  enableSlowConnectionMode(): void {
    this._slowConnectionMode = true;
    console.log('[Screen] Slow connection mode ENABLED - using differential rendering');
  }

  /**
   * Disable slow connection mode (use full redraws)
   */
  disableSlowConnectionMode(): void {
    this._slowConnectionMode = false;
    console.log('[Screen] Slow connection mode DISABLED - using full redraws');
  }

  /**
   * Check if slow connection mode is enabled
   */
  isSlowConnectionModeEnabled(): boolean {
    return this._slowConnectionMode;
  }

  /**
   * Create a blank line
   */
  blankLine(ch: string = ' ', attr: number = 0x000): [number, string][] {
    const line: [number, string][] = [];
    for (let x = 0; x < this.width; x++) {
      line[x] = [attr, ch];
    }
    return line;
  }

  clearRegion(xi: number, xl: number, yi: number, yl: number): void {
    for (let y = yi; y < yl; y++) {
      // Guard: check both height bounds AND actual buffer row existence
      if (y < 0 || y >= this.height || !this.buffer[y]) continue;

      for (let x = xi; x < xl; x++) {
        // Guard: check both width bounds AND actual buffer cell existence
        if (x < 0 || x >= this.width || !this.buffer[y][x]) continue;

        this.buffer[y][x] = [0x000, ' '];
      }
    }
    // Opt #5: Mark region as dirty for differential rendering
    this._markDirty(xi, yi, xl - 1, yl - 1);
  }

  fillRegion(attr: number, ch: string, xi: number, xl: number, yi: number, yl: number): void {
    // Check if background is transparent (0x1ff = no color)
    const bgColor = attr & 0x1ff;
    const isTransparentBg = bgColor === 0x1ff;

    for (let y = yi; y < yl; y++) {
      // Guard: check both height bounds AND actual buffer row existence
      if (y < 0 || y >= this.height || !this.buffer[y]) continue;

      for (let x = xi; x < xl; x++) {
        // Guard: check both width bounds AND actual buffer cell existence
        if (x < 0 || x >= this.width || !this.buffer[y][x]) continue;

        if (isTransparentBg) {
          // For transparent background: preserve existing bg color but update the character.
          // This ensures old content gets cleared (spaces overwrite stale chars) while
          // maintaining visual transparency of the background color.
          const existingAttr = this.buffer[y][x][0];
          const existingBg = existingAttr & 0x1ff;
          const newAttr = (attr & ~0x1ff) | existingBg;
          this.buffer[y][x] = [newAttr, ch];
        } else {
          this.buffer[y][x] = [attr, ch];
        }
      }
    }
    // Opt #5: Mark region as dirty for differential rendering
    this._markDirty(xi, yi, xl - 1, yl - 1);
  }

  // ============================================================================
  // Attribute Packing/Unpacking
  // ============================================================================

  /**
   * Pack attributes into 27-bit integer
   * Format: (flags << 18) | (fg << 9) | bg
   * Flags: bold(1), underline(2), blink(4), inverse(8), invisible(16)
   */
  private packAttr(flags: number, fg: number, bg: number): number {
    return (flags << 18) | (fg << 9) | bg;
  }

  /**
   * Unpack attributes from 27-bit integer
   */
  private unpackAttr(attr: number): { flags: number; fg: number; bg: number } {
    return {
      flags: (attr >> 18) & 0x1ff,
      fg: (attr >> 9) & 0x1ff,
      bg: attr & 0x1ff,
    };
  }

  /**
   * Convert attribute to ANSI string
   * EXACT 1:1 PORT from neo-blessed screen.js codeAttr() lines 1508-1572
   */
  private attrToAnsi(attr: number): string {
    const flags = (attr >> 18) & 0x1ff;
    let fg = (attr >> 9) & 0x1ff;
    let bg = attr & 0x1ff;

    // CRITICAL: Start with reset (SGR 0) to clear ALL previous attributes.
    // This ensures no bold/underline/inverse/etc. bleeding between cells.
    let out = '0;';

    // Flags (bold, underline, etc.)
    if (flags & 1) out += '1;';  // bold
    if (flags & 2) out += '4;';  // underline
    if (flags & 4) out += '5;';  // blink
    if (flags & 8) out += '7;';  // inverse
    if (flags & 16) out += '8;'; // invisible

    // Background color - ALWAYS explicitly set
    // BBS terminals expect black background by default, but web terminals often default to white.
    // We must ALWAYS emit an explicit background color, never rely on terminal default.
    if (bg === 0x1ff) {
      // Default/transparent bg -> use black (40) for BBS compatibility
      out += '40;';
    } else if (bg < 16) {
      if (bg < 8) {
        out += (bg + 40) + ';';  // Standard bg: 40-47
      } else {
        out += ((bg - 8) + 100) + ';';  // Bright bg: 100-107
      }
    } else {
      // 256-color mode for bg
      out += '48;5;' + bg + ';';
    }

    // Foreground color - ALWAYS explicitly set
    // Use white (37) as default fg for visibility on black background
    if (fg === 0x1ff) {
      // Default fg -> use white (37) for BBS compatibility on black bg
      out += '37;';
    } else if (fg < 16) {
      if (fg < 8) {
        out += (fg + 30) + ';';  // Standard fg: 30-37
      } else {
        out += ((fg - 8) + 90) + ';';  // Bright fg: 90-97
      }
    } else {
      // 256-color mode for fg
      out += '38;5;' + fg + ';';
    }

    // Remove trailing semicolon
    if (out[out.length - 1] === ';') out = out.slice(0, -1);

    return ESC + '[' + out + 'm';
  }

  /**
   * Parse style object to attribute code
   */
  private styleToAttr(style: any): number {
    // Return transparent for falsy style - allows parent bg to show through
    if (!style) return this.packAttr(0, 0x1ff, 0x1ff);

    let flags = 0;
    let fgCode = 0x1ff; // Default: no color
    let bgCode = 0x1ff; // Default: transparent/inherit (allows parent bg to show through)

    if (style.bold) flags |= 1;
    if (style.underline) flags |= 2;
    if (style.blink) flags |= 4;
    if (style.inverse) flags |= 8;
    if (style.invisible) flags |= 16;

    if (style.fg !== undefined) {
      fgCode = this._colorToCode(style.fg);
    }
    if (style.bg !== undefined) {
      bgCode = this._colorToCode(style.bg);
    }

    return this.packAttr(flags, fgCode, bgCode);
  }

  // ============================================================================
  // Rendering
  // ============================================================================

  render(): void {
    if (this.destroyed || this._locked) return;

    // Render synchronously for immediate visual feedback
    // This ensures text selection updates are visible during rapid key events
    this._doRender();
  }

  private _doRender(): void {
    if (this.destroyed) return;

    // CRITICAL: Ensure buffer dimensions match screen dimensions
    // This can get out of sync if terminal resizes without triggering realloc
    const expectedHeight = this._height;
    const expectedWidth = this._width;
    const actualHeight = this.buffer.length;
    const actualWidth = actualHeight > 0 ? this.buffer[0].length : 0;

    if (actualHeight !== expectedHeight || actualWidth !== expectedWidth) {
      // Buffer dimensions mismatch - reallocate
      console.log(`[Screen] Buffer size mismatch: buffer=${actualWidth}x${actualHeight}, screen=${expectedWidth}x${expectedHeight} - reallocating`);
      this.clearBuffers();
      this._fullRedrawNeeded = true;
    }

    // On first render, reset all terminal attributes to ensure clean state
    // This prevents leftover colors from previous screens affecting our output
    if (!(this as any)._hasRendered) {
      (this as any)._hasRendered = true;
      // Reset all attributes and clear screen
      this.write(ESC + '[0m');  // Reset all attributes
      this.write(ESC + '[2J');  // Clear screen
      this.write(ESC + '[H');   // Move cursor to home
      this._fullRedrawNeeded = true;
    }

    // Track if this is a full redraw request (for cache invalidation below)
    const needsFullRedraw = !this._optimizedRendering || this._fullRedrawNeeded;

    // ALWAYS mark entire screen as dirty to ensure _diff() processes all cells
    // This works with the full buffer clear below to prevent rendering corruption
    this._markDirty(0, 0, this.width - 1, this.height - 1);

    // Clear buffer with default attribute
    // CRITICAL FIX: Use bg=0 (black) instead of bg=0x1ff (transparent) for BBS consistency
    // Original neo-blessed uses 0x1ff which results in NO background ANSI code,
    // causing elements to use terminal's default background (not always black).
    // BBS doors expect black background by default.
    const dattr = ((0 << 18) | (0x1ff << 9)) | 0; // fg=0x1ff (default), bg=0 (black)
    // Use buffer dimensions, not screen dimensions, to avoid race condition during resize
    const bufHeight = this.buffer.length;
    const bufWidth = bufHeight > 0 ? this.buffer[0].length : 0;

    // Clear the buffer to prepare for rendering
    // In slow connection mode: Use TRUE differential rendering (don't touch lastBuffer)
    // In normal mode: Invalidate lastBuffer to force full redraw (prevents corruption)
    for (let y = 0; y < bufHeight; y++) {
      for (let x = 0; x < bufWidth; x++) {
        this.buffer[y][x] = [dattr, ' '];
        // Only invalidate lastBuffer in normal mode (full redraws)
        // In slow connection mode, keep lastBuffer intact for differential rendering
        // This reduces output from ~1920 chars to ~50-200 chars per render
        if (!this._slowConnectionMode && this.lastBuffer[y] && this.lastBuffer[y][x]) {
          this.lastBuffer[y][x] = [-1, '\x00'];
        }
      }
    }

    // CRITICAL: Invalidate ALL element coordinate caches before rendering
    // This ensures panels use their NEW positions after resize, not cached old positions
    if (needsFullRedraw) {
      this.walk((el) => {
        (el as any)._coordsCacheValid = false;
        (el as any)._coordsCache = null;
      });
    } else {
      // Optimized: only invalidate caches for dirty elements
      for (const el of this._dirtyElements) {
        (el as any)._coordsCacheValid = false;
        (el as any)._coordsCache = null;
      }
    }

    // Render all children recursively
    this._renderElement(this);

    // Dock borders if enabled
    if (this.options.dockBorders) {
      this._dockBorders();
    }

    // Diff and draw
    this._diff();

    // Mark as clean
    this.dirty = false;
    this._fullRedrawNeeded = false;
    this._dirtyElements.clear();

    // Opt #7: Rebuild mouse index after rendering
    this._rebuildMouseIndex();

    this.emit('render');
  }

  private _renderElement(element: Element): void {
    if (!element.visible || element.hidden || element.destroyed) {
      return;
    }

    // Calculate position
    const pos = element._getCoords();
    if (!pos) return;

    // Render shadow FIRST (behind the element)
    if ((element.options as any).shadow) {
      this._renderShadow(pos);
    }

    // Render element content
    this._renderContent(element, pos);

    // Render border
    if (element.options.border) {
      this._renderBorder(element, pos);
    }

    // Render scrollbar if element has one
    if ((element as any).hasScrollbar?.() && (element as any).renderScrollbar) {
      (element as any).renderScrollbar();
    }

    // Render children - sort by zIndex if available
    const sortedChildren = [...element.children].sort((a, b) => {
      const zA = a.options.zIndex || 0;
      const zB = b.options.zIndex || 0;
      return zA - zB;
    });

    for (const child of sortedChildren) {
      this._renderElement(child);
    }

    // Re-render parent border AFTER children to ensure it stays visible
    // This handles cases where child content might extend into the border area
    // (e.g., during resize operations or with scrollable content)
    if (element.options.border && sortedChildren.length > 0) {
      this._renderBorder(element, pos);
    }
  }

  /**
   * Render shadow effect (EXACT 1:1 PORT FROM blessed element.js lines 2119-2145)
   * Uses colors.blend() with single argument to darken pixels
   */
  private _renderShadow(pos: any): void {
    const { xi, xl, yi, yl } = pos;

    // Mark shadow area as dirty so _diff() outputs the changes
    // Shadow extends 2 chars right and 1 row down
    this._markDirty(xl, yi + 1, xl + 1, yl);
    this._markDirty(xi + 1, yl, xl - 1, yl);

    // Right shadow (exactly from blessed)
    let y = Math.max(yi + 1, 0);
    for (; y < yl + 1; y++) {
      if (!this.buffer[y]) break;
      let x = xl;
      for (; x < xl + 2; x++) {
        if (!this.buffer[y][x]) break;
        // blessed: lines[y][x][0] = colors.blend(lines[y][x][0])
        this.buffer[y][x][0] = blend(this.buffer[y][x][0]);
      }
    }

    // Bottom shadow (exactly from blessed)
    y = yl;
    for (; y < yl + 1; y++) {
      if (!this.buffer[y]) break;
      for (let x = Math.max(xi + 1, 0); x < xl; x++) {
        if (!this.buffer[y][x]) break;
        // blessed: lines[y][x][0] = colors.blend(lines[y][x][0])
        this.buffer[y][x][0] = blend(this.buffer[y][x][0]);
      }
    }
  }

  private _renderContent(element: Element, pos: any): void {
    // Use getVisibleLines() to respect scroll position (childBase)
    const lines = (element as any).getVisibleLines ? (element as any).getVisibleLines() : element.getLines();
    const padding = element.options.padding || 0;
    const hasBorder = element.options.border && (element.options.border as any)?.type !== 'none';
    const border = hasBorder ? 1 : 0;

    const padLeft = typeof padding === 'number' ? padding : (padding as any).left || 0;
    const padTop = typeof padding === 'number' ? padding : (padding as any).top || 0;
    const padBottom = typeof padding === 'number' ? padding : (padding as any).bottom || 0;
    const padRight = typeof padding === 'number' ? padding : (padding as any).right || 0;

    const startY = pos.yi + border + padTop;
    const startX = pos.xi + border + padLeft;
    const maxY = pos.yl - border - padBottom;
    const maxX = pos.xl - border - padRight;

    // Mark element content area as dirty so _diff() outputs the changes
    // This is critical for scrolling to work - content changes need to be in dirty region
    this._markDirty(startX, startY, maxX - 1, maxY - 1);

    // BBS Constraint: Enforce 80-column width limit (unless responsive mode)
    let bbsMaxX = this._responsive ? maxX : Math.min(maxX, 80);
    let bbsMaxY = maxY;

    // CRITICAL FIX: Clamp rendering area to parent bounds to prevent background/content leaking
    if (element.parent && element.parent !== this) {
      const parentPos = element.parent._getCoords();
      if (parentPos) {
        // Clamp to parent's content area (inside border)
        const parentHasBorder = element.parent.options?.border && (element.parent.options.border as any)?.type !== 'none';
        const parentBorder = parentHasBorder ? 1 : 0;
        const parentMaxX = parentPos.xl - parentBorder;
        const parentMaxY = parentPos.yl - parentBorder;
        bbsMaxX = Math.min(bbsMaxX, parentMaxX);
        bbsMaxY = Math.min(bbsMaxY, parentMaxY);
      }
    }

    // Get style attribute code with focus/hover/disabled state applied
    let style = element.options.style || {};
    const focusStyle = (element.options.style as any)?.focus;
    const hoverStyle = (element.options.style as any)?.hover;
    const disabledStyle = (element.options.style as any)?.disabled;

    if ((element as any).disabled && disabledStyle) {
      style = { ...style, ...disabledStyle };
    } else if (element.focused && focusStyle) {
      style = { ...style, ...focusStyle };
    } else if ((element as any)._hovered && hoverStyle) {
      style = { ...style, ...hoverStyle };
    }
    const baseAttr = this.styleToAttr(style);

    // Check for neo-blessed style transparency (color blending at 50% opacity)
    const isBlendTransparent = !!(style as any).transparent;

    // Fill background (for elements without borders, this is essential for visibility)
    // BUT skip if background is transparent (0x1ff) - preserve existing content
    const bgColor = baseAttr & 0x1ff;
    const isTransparentBg = bgColor === 0x1ff;
    const fillChar = (element.options as any).ch || ' ';

    if (isBlendTransparent) {
      // Neo-blessed style: blend colors at 50% opacity
      // Keep underlying characters visible, only blend the color attributes
      // EXACT from neo-blessed element.js line 1945: colors.blend(attr, lines[y][x][0])
      for (let y = startY; y < maxY; y++) {
        if (y < 0 || y >= this.height || !this.buffer[y]) continue;
        for (let x = startX; x < bbsMaxX; x++) {
          if (x < 0 || x >= this.width || !this.buffer[y][x]) continue;
          const existingAttr = this.buffer[y][x][0];
          const existingChar = this.buffer[y][x][1];
          // Two arguments = transparency mode (blends at 50% alpha by default)
          const blendedAttr = blend(baseAttr, existingAttr);
          this.buffer[y][x] = [blendedAttr, existingChar];
        }
      }
    } else if (!isTransparentBg) {
      // Normal fill - overwrite buffer (now uses clamped bounds from above)
      for (let y = startY; y < bbsMaxY; y++) {
        if (y < 0 || y >= this.height || !this.buffer[y]) continue;
        for (let x = startX; x < bbsMaxX; x++) {
          if (x < 0 || x >= this.width || !this.buffer[y][x]) continue;
          this.buffer[y][x] = [baseAttr, fillChar];
        }
      }
    } else {
      // Transparent bg: clear characters but preserve each cell's existing bg color.
      // Without this, old content persists as ghost artifacts when content shrinks.
      for (let y = startY; y < bbsMaxY; y++) {
        if (y < 0 || y >= this.height || !this.buffer[y]) continue;
        for (let x = startX; x < bbsMaxX; x++) {
          if (x < 0 || x >= this.width || !this.buffer[y][x]) continue;
          const existingAttr = this.buffer[y][x][0];
          const existingBg = existingAttr & 0x1ff;
          const newAttr = (baseAttr & ~0x1ff) | existingBg;
          this.buffer[y][x] = [newAttr, fillChar];
        }
      }
    }

    // Render lines (using clamped bounds to prevent content leaking outside parent)
    for (let i = 0; i < lines.length; i++) {
      const y = startY + i;
      // Guard: check both this.height AND actual buffer existence to prevent crashes during resize
      if (y < 0 || y >= this.height || y >= bbsMaxY || !this.buffer[y]) continue;

      const line = lines[i];

      // Parse line with ANSI codes and render character by character
      let currentAttr = baseAttr;
      let x = startX;
      let idx = 0;

      while (idx < line.length && x < bbsMaxX) {
        // Check for ANSI escape sequence
        if (line[idx] === ESC && line[idx + 1] === '[') {
          // Parse ANSI sequence
          let end = idx + 2;
          while (end < line.length && !/[mK]/.test(line[end])) {
            end++;
          }
          if (end < line.length && line[end] === 'm') {
            // Extract SGR parameters
            const params = line.slice(idx + 2, end);
            currentAttr = this._parseAnsiToAttr(params, currentAttr, baseAttr);
            idx = end + 1;
            continue;
          }
          // Skip unknown sequences
          idx = end + 1;
          continue;
        }

        // Regular character - write to buffer
        // Guard: check both width bounds AND actual buffer cell existence
        if (x >= 0 && x < this.width && this.buffer[y] && this.buffer[y][x]) {
          // Check if current character attr has transparent bg (may have been changed by ANSI codes)
          const charBgColor = currentAttr & 0x1ff;
          const charHasTransparentBg = charBgColor === 0x1ff;

          if (isBlendTransparent) {
            // Blend text color with existing content
            // EXACT from neo-blessed element.js line 2076: colors.blend(attr, lines[y][x][0])
            const existingAttr = this.buffer[y][x][0];
            // Two arguments = transparency mode (blends at 50% alpha by default)
            const blendedAttr = blend(currentAttr, existingAttr);
            this.buffer[y][x] = [blendedAttr, line[idx]];
          } else if (charHasTransparentBg) {
            // Transparent bg: preserve existing background, update fg and character
            const existingAttr = this.buffer[y][x][0];
            const existingBg = existingAttr & 0x1ff;
            const newAttr = (currentAttr & ~0x1ff) | existingBg;
            this.buffer[y][x] = [newAttr, line[idx]];
          } else {
            this.buffer[y][x] = [currentAttr, line[idx]];
          }
        }
        x++;
        idx++;
      }
    }
  }

  /**
   * Parse ANSI SGR parameters and update attribute
   */
  private _parseAnsiToAttr(params: string, currentAttr: number, baseAttr: number): number {
    const rawCodes = params.length ? params.split(';') : ['0'];
    const codes = rawCodes.map((value) => {
      const parsed = parseInt(value, 10);
      return Number.isNaN(parsed) ? 0 : parsed;
    });
    let { flags, fg, bg } = this.unpackAttr(currentAttr);
    const base = this.unpackAttr(baseAttr);

    for (let i = 0; i < codes.length; i++) {
      const code = codes[i];
      if (code === 0) {
        flags = base.flags;
        fg = base.fg;
        bg = base.bg;
      } else if (code === 1) {
        flags |= 1; // bold
      } else if (code === 4) {
        flags |= 2; // underline
      } else if (code === 5) {
        flags |= 4; // blink
      } else if (code === 7) {
        flags |= 8; // inverse
      } else if (code === 8) {
        flags |= 16; // invisible
      } else if (code === 22) {
        flags &= ~1; // normal intensity
      } else if (code === 24) {
        flags &= ~2; // underline off
      } else if (code === 25) {
        flags &= ~4; // blink off
      } else if (code === 27) {
        flags &= ~8; // inverse off
      } else if (code === 28) {
        flags &= ~16; // visible
      } else if (code >= 30 && code <= 37) {
        fg = code - 30; // foreground color 0-7
      } else if (code >= 90 && code <= 97) {
        fg = code - 90 + 8; // bright foreground
      } else if (code === 39) {
        fg = base.fg;
      } else if (code >= 40 && code <= 47) {
        bg = code - 40; // background color 0-7
      } else if (code >= 100 && code <= 107) {
        bg = code - 100 + 8; // bright background
      } else if (code === 49) {
        bg = base.bg;
      } else if (code === 38 && codes[i + 1] === 5 && typeof codes[i + 2] === 'number') {
        fg = Math.max(0, Math.min(255, codes[i + 2]));
        i += 2;
      } else if (code === 48 && codes[i + 1] === 5 && typeof codes[i + 2] === 'number') {
        bg = Math.max(0, Math.min(255, codes[i + 2]));
        i += 2;
      }
    }

    return this.packAttr(flags, fg, bg);
  }

  private _renderBorder(element: Element, pos: any): void {
    const border = element.options.border;
    if (!border) return;

    const borderType = typeof border === 'string' ? border : (border as any)?.type || 'line';

    if (borderType === 'none') return;

    // Mark border area as dirty so _diff() outputs the changes
    this._markDirty(pos.xi, pos.yi, pos.xl - 1, pos.yl - 1);

    const borderChars: Record<string, { tl: string; tr: string; bl: string; br: string; h: string; v: string }> = {
      line: { tl: '┌', tr: '┐', bl: '└', br: '┘', h: '─', v: '│' },
      heavy: { tl: '┏', tr: '┓', bl: '┗', br: '┛', h: '━', v: '┃' },
      double: { tl: '╔', tr: '╗', bl: '╚', br: '╝', h: '═', v: '║' },
      round: { tl: '╭', tr: '╮', bl: '╰', br: '╯', h: '─', v: '│' },
      ascii: { tl: '.', tr: '.', bl: '`', br: '\'', h: '-', v: '|' },
      bg: { tl: ' ', tr: ' ', bl: ' ', br: ' ', h: ' ', v: ' ' },
    };

    const chars = borderChars[borderType] ?? borderChars.line;

    // Determine border style with hover/focus/disabled support
    let borderStyle = (element.options.style as any)?.border || {};
    
    if (element.disabled) {
      const disabledStyle = (element.options.style as any)?.disabled;
      if (disabledStyle?.border) {
        borderStyle = { ...borderStyle, ...disabledStyle.border };
      } else {
        borderStyle = { ...borderStyle, fg: 'gray' };
      }
    } else if ((element as any)._overBorder) {
      // HOVER HIGHLIGHT
      const hoverStyle = (element.options.style as any)?.hover;
      if (hoverStyle?.border) {
        borderStyle = { ...borderStyle, ...hoverStyle.border };
      } else {
        // Default hover: bright white
        borderStyle = { ...borderStyle, fg: 'white', bold: true };
      }
    } else if (element.hasFocusedChild()) {
      const focusStyle = (element.options.style as any)?.focus;
      if (focusStyle?.border) {
        borderStyle = { ...borderStyle, ...focusStyle.border };
      } else {
        // Default focus: cyan
        borderStyle = { ...borderStyle, fg: 'cyan', bold: true };
      }
    }

    const attr = this.styleToAttr(borderStyle);

    // Label uses border style if available, otherwise default
    const labelStyle = typeof border === 'object' && (border as any).labelStyle
      ? (border as any).labelStyle
      : borderStyle || {};
    const labelAttr = this.styleToAttr(labelStyle);

    // Top border
    // Guard: check both height bounds AND actual buffer row existence
    if (pos.yi >= 0 && pos.yi < this.height && this.buffer[pos.yi]) {
      for (let x = pos.xi; x < pos.xl; x++) {
        if (x < 0 || x >= this.width || !this.buffer[pos.yi][x]) continue;

        let ch = chars.h;
        if (x === pos.xi) ch = chars.tl;
        else if (x === pos.xl - 1) ch = chars.tr;

        this.buffer[pos.yi][x] = [attr, ch];
      }
    }

    // Bottom border
    const bottomY = pos.yl - 1;
    // Guard: check both height bounds AND actual buffer row existence
    if (bottomY >= 0 && bottomY < this.height && this.buffer[bottomY]) {
      for (let x = pos.xi; x < pos.xl; x++) {
        if (x < 0 || x >= this.width || !this.buffer[bottomY][x]) continue;

        let ch = chars.h;
        if (x === pos.xi) ch = chars.bl;
        else if (x === pos.xl - 1) ch = chars.br;

        this.buffer[bottomY][x] = [attr, ch];
      }
    }

    // Left and right borders
    for (let y = pos.yi + 1; y < pos.yl - 1; y++) {
      // Guard: check both height bounds AND actual buffer row existence
      if (y < 0 || y >= this.height || !this.buffer[y]) continue;

      if (pos.xi >= 0 && pos.xi < this.width && this.buffer[y][pos.xi]) {
        this.buffer[y][pos.xi] = [attr, chars.v];
      }

      const rightBorderX = pos.xl - 1;
      if (rightBorderX >= 0 && rightBorderX < this.width && this.buffer[y][rightBorderX]) {
        this.buffer[y][rightBorderX] = [attr, chars.v];
      }
    }

    // Label - use border.label if specified, otherwise element.options.label
    const labelSource = (typeof border === 'object' && (border as any).label)
      ? (border as any).label
      : element.options.label;
    if (labelSource) {
      const rawLabel = String(labelSource).trim();
      // Check if label contains blessed tags like {cyan-fg}
      const hasInlineTags = rawLabel.includes('{') && rawLabel.includes('}');

      if (borderType === 'ascii') {
        // For ASCII borders, strip tags and use labelAttr
        const strippedLabel = rawLabel.replace(/\{[^}]+\}/g, '');
        this._renderAsciiLabel(pos, strippedLabel, labelAttr, attr);
      } else if (hasInlineTags) {
        // Parse blessed tags and render with inline styles
        const labelText = ` ${rawLabel} `;
        const styledChars = this._parseStyledLabel(labelText, labelAttr);
        let x = pos.xi + 2;
        for (let i = 0; i < styledChars.length && x < pos.xl - 1; i += 1, x += 1) {
          // Guard: check buffer existence
          if (x >= 0 && x < this.width && this.buffer[pos.yi] && this.buffer[pos.yi][x]) {
            this.buffer[pos.yi][x] = styledChars[i];
          }
        }
      } else {
        // No inline tags, use labelAttr (from labelStyle or default)
        const labelText = ` ${rawLabel} `;
        let x = pos.xi + 2;
        for (let i = 0; i < labelText.length && x < pos.xl - 1; i += 1, x += 1) {
          // Guard: check buffer existence
          if (x >= 0 && x < this.width && this.buffer[pos.yi] && this.buffer[pos.yi][x]) {
            this.buffer[pos.yi][x] = [labelAttr, labelText[i]];
          }
        }
      }
    }
  }

  private _dockBorders(): void {
    for (let y = 0; y < this.height; y++) {
      // Guard: check buffer row exists
      if (!this.buffer[y]) continue;
      for (let x = 0; x < this.width; x++) {
        // Guard: check buffer cell exists
        if (!this.buffer[y][x]) continue;
        const ch = this.buffer[y][x][1];
        if (!ANGLES[ch]) continue;
        this.buffer[y][x][1] = this._getAngle(this.buffer, x, y, ch);
      }
    }
  }

  private _renderAsciiLabel(pos: any, label: string, labelAttr: number, borderAttr: number): void {
    if (!label) return;
    // Guard: check buffer row exists
    if (!this.buffer[pos.yi]) return;

    const text = `[ ${label} ]`;
    const maxWidth = Math.max(0, pos.xl - pos.xi - 2);
    const truncated = text.length > maxWidth ? text.slice(0, maxWidth) : text;
    const minStart = pos.xi + 3;
    const maxStart = Math.max(pos.xi + 1, pos.xl - truncated.length - 1);
    const start = minStart <= maxStart ? minStart : maxStart;

    for (let i = 0; i < truncated.length && start + i < pos.xl - 1; i += 1) {
      const x = start + i;
      // Guard: check buffer cell exists
      if (x >= 0 && x < this.width && this.buffer[pos.yi][x]) {
        this.buffer[pos.yi][x] = [labelAttr, truncated[i]];
      }
    }

    for (let x = pos.xi + 1; x < start && x < this.width; x += 1) {
      // Guard: check buffer cell exists
      if (x >= 0 && this.buffer[pos.yi][x]) {
        this.buffer[pos.yi][x] = [borderAttr, '-'];
      }
    }

    const end = start + truncated.length;
    for (let x = end; x < pos.xl - 1 && x < this.width; x += 1) {
      // Guard: check buffer cell exists
      if (x >= 0 && this.buffer[pos.yi][x]) {
        this.buffer[pos.yi][x] = [borderAttr, '-'];
      }
    }
  }

  /**
   * Parse a label string with blessed tags and return styled characters
   * Handles tags like {cyan-fg}Text{/} and extracts attributes for each character
   */
  private _parseStyledLabel(text: string, defaultAttr: number): [number, string][] {
    const result: [number, string][] = [];
    let currentAttr = defaultAttr;
    let i = 0;

    while (i < text.length) {
      // Check for tag opening
      if (text[i] === '{') {
        const closeIdx = text.indexOf('}', i);
        if (closeIdx !== -1) {
          const tag = text.slice(i + 1, closeIdx);

          // Handle closing tags
          if (tag.startsWith('/')) {
            currentAttr = defaultAttr; // Reset to default
          } else {
            // Parse opening tag
            const style = this._tagToStyle(tag);
            if (style) {
              currentAttr = this.styleToAttr(style);
            }
          }
          i = closeIdx + 1;
          continue;
        }
      }

      // Regular character
      result.push([currentAttr, text[i]]);
      i++;
    }

    return result;
  }

  /**
   * Convert a blessed tag name to a style object
   */
  private _tagToStyle(tag: string): Record<string, any> | null {
    // Handle foreground colors: "cyan-fg", "red-fg", etc.
    if (tag.endsWith('-fg')) {
      const colorName = tag.slice(0, -3);
      return { fg: colorName };
    }

    // Handle background colors: "cyan-bg", "red-bg", etc.
    if (tag.endsWith('-bg')) {
      const colorName = tag.slice(0, -3);
      return { bg: colorName };
    }

    // Handle style attributes
    switch (tag) {
      case 'bold':
        return { bold: true };
      case 'underline':
        return { underline: true };
      case 'blink':
        return { blink: true };
      case 'inverse':
        return { inverse: true };
      default:
        // Could be a color name alone (treated as fg)
        if (tag.match(/^[a-z]+$/)) {
          return { fg: tag };
        }
        return null;
    }
  }

  private _getAngle(lines: [number, string][][], x: number, y: number, fallback: string): string {
    let angle = 0;
    const attr = lines[y][x][0];

    if (lines[y][x - 1] && L_ANGLES[lines[y][x - 1][1]]) {
      if (!this.options.ignoreDockContrast && lines[y][x - 1][0] !== attr) {
        return fallback;
      }
      angle |= 1 << 3;
    }

    if (lines[y - 1] && U_ANGLES[lines[y - 1][x][1]]) {
      if (!this.options.ignoreDockContrast && lines[y - 1][x][0] !== attr) {
        return fallback;
      }
      angle |= 1 << 2;
    }

    if (lines[y][x + 1] && R_ANGLES[lines[y][x + 1][1]]) {
      if (!this.options.ignoreDockContrast && lines[y][x + 1][0] !== attr) {
        return fallback;
      }
      angle |= 1 << 1;
    }

    if (lines[y + 1] && D_ANGLES[lines[y + 1][x][1]]) {
      if (!this.options.ignoreDockContrast && lines[y + 1][x][0] !== attr) {
        return fallback;
      }
      angle |= 1 << 0;
    }

    return ANGLE_TABLE[angle] || fallback;
  }

  // Opt #5: Mark rectangular region as dirty
  private _markDirty(x1: number, y1: number, x2: number, y2: number): void {
    // Expand dirty region to include new area
    this._dirtyMinX = Math.min(this._dirtyMinX, x1);
    this._dirtyMinY = Math.min(this._dirtyMinY, y1);
    this._dirtyMaxX = Math.max(this._dirtyMaxX, x2);
    this._dirtyMaxY = Math.max(this._dirtyMaxY, y2);
  }

  private _diff(): void {
    // Opt #4: Use array join instead of string concat (O(n) vs O(n²))
    const parts: string[] = [];
    let lastX = -1;
    let lastY = -1;
    let lastAttr = -1;

    // Opt #5: Only diff dirty region (50-60% reduction in cells checked)
    // If dirty region is invalid (min > max), diff entire screen
    let minY = this._dirtyMinY;
    let maxY = this._dirtyMaxY;
    let minX = this._dirtyMinX;
    let maxX = this._dirtyMaxX;

    // Use actual buffer dimensions to avoid race condition during resize
    const bufHeight = this.buffer.length;
    const bufWidth = bufHeight > 0 ? this.buffer[0].length : 0;

    if (minY > maxY || minX > maxX) {
      // Invalid region, diff entire buffer
      minY = 0;
      maxY = bufHeight - 1;
      minX = 0;
      maxX = bufWidth - 1;
    } else {
      // Clamp to buffer bounds (not screen bounds to avoid race condition)
      minY = Math.max(0, Math.min(minY, bufHeight - 1));
      maxY = Math.max(0, Math.min(maxY, bufHeight - 1));
      minX = Math.max(0, Math.min(minX, bufWidth - 1));
      maxX = Math.max(0, Math.min(maxX, bufWidth - 1));
    }

    for (let y = minY; y <= maxY; y++) {
      // Guard: check buffer row exists
      if (!this.buffer[y] || !this.lastBuffer[y]) continue;

      for (let x = minX; x <= maxX; x++) {
        // Guard: check buffer cells exist
        if (!this.buffer[y][x] || !this.lastBuffer[y][x]) continue;
        const [attr, ch] = this.buffer[y][x];
        const [lastAttrCell, lastCh] = this.lastBuffer[y][x];

        if (attr !== lastAttrCell || ch !== lastCh) {
          // Position cursor if needed
          if (x !== lastX + 1 || y !== lastY) {
            // ALWAYS use explicit cursor positioning to prevent drift
            // The \r\n optimization was causing rendering corruption on hover
            parts.push(cursor.pos(x, y));
          }

          // Change attributes if needed
          if (attr !== lastAttr) {
            parts.push(this.attrToAnsi(attr));
            lastAttr = attr;
          }

          // Write character
          parts.push(ch);
          this.lastBuffer[y][x] = [attr, ch];

          lastX = x;
          lastY = y;
        }
      }
    }

    if (parts.length > 0) {
      this.write(parts.join(''));
    }

    // Opt #5: Reset dirty region after rendering
    this._dirtyMinX = Infinity;
    this._dirtyMinY = Infinity;
    this._dirtyMaxX = -Infinity;
    this._dirtyMaxY = -Infinity;
  }

  draw(start: number, end: number): void {
    this.render();
  }

  // ============================================================================
  // Line Manipulation (Scrolling Support)
  // ============================================================================

  /**
   * Insert n blank buffer lines at position, pushing existing lines down
   */
  private _insertBufferLine(n: number, y: number, top: number, bottom: number): void {
    if (n <= 0) return;

    // Shift lines down
    for (let i = bottom - 1; i >= y + n; i--) {
      this.buffer[i] = this.buffer[i - n];
      this.lastBuffer[i] = this.lastBuffer[i - n];
    }

    // Fill new lines with blanks
    for (let i = y; i < y + n; i++) {
      this.buffer[i] = this.blankLine();
      this.lastBuffer[i] = this.blankLine();
    }
  }

  /**
   * Delete n buffer lines at position, pulling lines up
   */
  private _deleteBufferLine(n: number, y: number, top: number, bottom: number): void {
    if (n <= 0) return;

    // Shift lines up
    for (let i = y; i < bottom - n; i++) {
      this.buffer[i] = this.buffer[i + n];
      this.lastBuffer[i] = this.lastBuffer[i + n];
    }

    // Fill bottom lines with blanks
    for (let i = bottom - n; i < bottom; i++) {
      this.buffer[i] = this.blankLine();
      this.lastBuffer[i] = this.blankLine();
    }
  }

  /**
   * Insert n lines at bottom of region
   */
  insertBottomLines(top: number, bottom: number, n: number = 1): void {
    this._insertBufferLine(n, bottom - n, top, bottom);
  }

  /**
   * Delete n lines from bottom of region
   */
  deleteBottomLines(top: number, bottom: number, n: number = 1): void {
    this._deleteBufferLine(n, bottom - n, top, bottom);
  }

  /**
   * Insert n lines at top of region
   */
  insertTopLines(top: number, bottom: number, n: number = 1): void {
    this._insertBufferLine(n, top, top, bottom);
  }

  /**
   * Delete n lines from top of region
   */
  deleteTopLines(top: number, bottom: number, n: number = 1): void {
    this._deleteBufferLine(n, top, top, bottom);
  }

  /**
   * Scroll screen up by n lines
   */
  scrollUp(n: number = 1): void {
    this.deleteTopLines(0, this.height, n);
  }

  /**
   * Scroll screen down by n lines
   */
  scrollDown(n: number = 1): void {
    this.insertTopLines(0, this.height, n);
  }

  /**
   * Insert n lines at y position within scroll region (buffer manipulation)
   * Neo-blessed compatible API - different from Element.insertLine which handles content
   */
  insertBufferLines(n: number, y: number, top: number, bottom: number): void {
    this._insertBufferLine(n, y, top, bottom);
  }

  /**
   * Delete n lines at y position within scroll region (buffer manipulation)
   * Neo-blessed compatible API - different from Element.deleteLine which handles content
   */
  deleteBufferLines(n: number, y: number, top: number, bottom: number): void {
    this._deleteBufferLine(n, y, top, bottom);
  }

  /**
   * Insert line at top of scroll region (buffer manipulation)
   */
  insertBufferTop(top: number, bottom: number): void {
    this.insertBufferLines(1, top, top, bottom);
  }

  /**
   * Insert line at bottom of scroll region (buffer manipulation)
   */
  insertBufferBottom(top: number, bottom: number): void {
    this.deleteBufferLines(1, top, top, bottom);
  }

  /**
   * Delete line at top of scroll region (buffer manipulation)
   */
  deleteBufferTop(top: number, bottom: number): void {
    this.deleteBufferLines(1, top, top, bottom);
  }

  /**
   * Delete line at bottom of scroll region (buffer manipulation)
   */
  deleteBufferBottom(top: number, bottom: number): void {
    this.clearRegion(0, this.width, bottom, bottom + 1);
  }

  /**
   * Set scroll region (uses terminal CSR)
   */
  setScrollRegion(top: number, bottom: number): void {
    this.program.csr(top, bottom);
  }

  /**
   * Reset scroll region
   */
  resetScrollRegion(): void {
    this.program.resetCursor();
  }

  // ============================================================================
  // Focus Management
  // ============================================================================

  /**
   * Push current focus to stack and focus a new element
   */
  focusPush(element: Element): void {
    if (this._focused) {
      this.focusStack.push(this._focused);
    }
    element.focus();
  }

  /**
   * Pop focus from stack and restore it
   */
  focusPop(): Element | null {
    const prev = this.focusStack.pop();
    if (prev && !prev.destroyed) {
      prev.focus();
      return prev;
    }
    return null;
  }

  saveFocus(): Element | null {
    this.savedFocus = this._focused;
    return this.savedFocus;
  }

  restoreFocus(): Element | null {
    if (this.savedFocus) {
      this.savedFocus.focus();
    }
    return this.savedFocus;
  }

  rewindFocus(): void {
    while (this.focusHistory.length > 0) {
      this.focusPop();
    }
  }

  /**
   * Enable focus trapping within a container (for modals)
   * Tab/Shift+Tab will only cycle through elements within the container
   */
  trapFocus(container: Element): void {
    if (this.focusTrap === container) return;

    // Save current focus via stack
    if (this._focused) {
      this.focusStack.push(this._focused);
    }
    
    this.focusTrap = container;

    // Focus first element in trap
    const focusable = this._getFocusable(container);
    if (focusable.length > 0) {
      focusable[0].focus();
    }
  }

  /**
   * Disable focus trapping and restore previous focus
   */
  releaseFocusTrap(): void {
    if (!this.focusTrap) return;

    this.focusTrap = null;

    // Restore focus from stack
    this.focusPop();
  }

  /**
   * Check if focus is currently trapped
   */
  isFocusTrapped(): boolean {
    return this.focusTrap !== null;
  }

  /**
   * Get the current focus trap container (if any)
   */
  getFocusTrap(): Element | null {
    return this.focusTrap;
  }

  /**
   * Get all focusable elements in tree order, sorted by tabIndex
   * If focus is trapped, only returns elements within the trap container
   */
  private _getFocusable(element: Element = this): Element[] {
    const root = this.focusTrap || element;
    const focusableList: Element[] = [];

    const traverse = (el: Element) => {
      if (el.hidden || !el.visible || (el as any).disabled || el.destroyed) {
        return;
      }

      // Check if element itself is focusable
      const isFocusable = el.options && el.options.focusable && 
                         el.options.tabbable !== false && 
                         el.options.tabIndex !== -1;

      if (isFocusable) {
        focusableList.push(el);
      }

      // Continue to children
      if (el.children) {
        // Sort children by tabIndex if provided, otherwise natural tree order
        const sortedChildren = [...el.children].sort((a, b) => {
          const aIdx = (a.options && a.options.tabIndex) || 0;
          const bIdx = (b.options && b.options.tabIndex) || 0;
          if (aIdx > 0 && bIdx > 0) return aIdx - bIdx;
          if (aIdx > 0) return -1;
          if (bIdx > 0) return 1;
          return 0;
        });

        for (const child of sortedChildren) {
          traverse(child);
        }
      }
    };

    traverse(root);
    return focusableList;
  }

  /**
   * Focus next focusable element
   */
  focusNext(): void {
    const focusable = this._getFocusable();
    if (focusable.length === 0) return;

    const current = this._focused;
    if (!current) {
      focusable[0].focus();
      return;
    }

    const index = focusable.indexOf(current);
    if (index === -1) {
      focusable[0].focus();
      return;
    }

    const next = focusable[(index + 1) % focusable.length];
    next.focus();
  }

  /**
   * Focus previous focusable element
   */
  focusPrevious(): void {
    const focusable = this._getFocusable();
    if (focusable.length === 0) return;

    const current = this._focused;
    if (!current) {
      focusable[focusable.length - 1].focus();
      return;
    }

    const index = focusable.indexOf(current);
    if (index === -1) {
      focusable[focusable.length - 1].focus();
      return;
    }

    const prev = focusable[(index - 1 + focusable.length) % focusable.length];
    prev.focus();
  }

  /**
   * Alias for focusPrevious
   */
  focusPrev(): void {
    this.focusPrevious();
  }

  /**
   * Focus element at offset from current
   */
  focusOffset(offset: number): void {
    const focusable = this._getFocusable();
    if (focusable.length === 0) return;

    const current = this._focused;
    if (!current) {
      const index = offset >= 0 ? 0 : focusable.length - 1;
      focusable[index].focus();
      return;
    }

    const index = focusable.indexOf(current);
    if (index === -1) {
      focusable[0].focus();
      return;
    }

    const newIndex = (index + offset) % focusable.length;
    const target = focusable[newIndex < 0 ? newIndex + focusable.length : newIndex];
    target.focus();
  }

  /**
   * Enable global key bindings (F12, Alt+M) to toggle mouse tracking.
   * Useful for allowing users to disable mouse capture for text selection.
   * @param callback Optional callback triggered on toggle, receives (enabled: boolean)
   */
  enableMouseToggle(callback?: (enabled: boolean) => void): void {
    let mouseEnabled = true;
    this.key(['f12', 'M-m'], () => {
      mouseEnabled = !mouseEnabled;
      if (mouseEnabled) {
        this.enableMouse();
      } else {
        this.disableMouse();
      }
      if (callback) {
        callback(mouseEnabled);
      }
      this.render();
    });
  }

  // ============================================================================
  // Key Handling
  // ============================================================================

  key(keys: string | string[], handler: (ch: any, key: KeyEvent) => void): void {
    const keyList = Array.isArray(keys) ? keys : [keys];

    for (const k of keyList) {
      if (!this.keyHandlers.has(k)) {
        this.keyHandlers.set(k, []);
      }
      this.keyHandlers.get(k)!.push(handler);
    }
  }

  onceKey(keys: string | string[], handler: (ch: any, key: KeyEvent) => void): void {
    const wrapper = (ch: any, key: KeyEvent) => {
      this.unkey(keys, wrapper);
      handler(ch, key);
    };
    this.key(keys, wrapper);
  }

  unkey(keys: string | string[], handler: (ch: any, key: KeyEvent) => void): void {
    const keyList = Array.isArray(keys) ? keys : [keys];

    for (const k of keyList) {
      const handlers = this.keyHandlers.get(k);
      if (handlers) {
        const index = handlers.indexOf(handler);
        if (index !== -1) {
          handlers.splice(index, 1);
        }
      }
    }
  }

  // Called by external input handler
  _handleKey(ch: any, key: KeyEvent): void {
    // Attempt to unlock audio on first interaction
    if ((this as any)._audioUnlocked === undefined) {
      (this as any)._audioUnlocked = true;
      this.emit('user-interaction');
    }

    // Respect key locking
    if (this._lockKeys) return;

    let focusTrap = this.focusTrap;
    if (focusTrap && ((focusTrap as any).hidden || (focusTrap as any).destroyed)) {
      this.releaseFocusTrap();
      focusTrap = this.focusTrap;
    }
    const suppressGlobalKeys = !!focusTrap;
    const focused = this._focused as any;
    if (focusTrap && focused && focused !== focusTrap && !focused.hasAncestor?.(focusTrap)) {
      const focusable = this._getFocusable();
      if (focusable.length > 0) {
        focusable[0].focus();
      }
    }

    // Try registered screen key handlers first (unless focus is trapped)
    const handlers = suppressGlobalKeys ? undefined : this.keyHandlers.get(key.full || key.name);
    let handled = false;
    if (handlers && handlers.length > 0) {
      for (const handler of handlers) {
        if (handler(ch, key) === true) handled = true;
      }
    }

    // Emit to focused element
    if (!handled && this._focused) {
      // Emit specific key event first (for element.key() handlers)
      const keyName = key.full || key.name;
      if (keyName) {
        if (this._focused.emit(`keypress ${keyName}`, ch, key) === true) handled = true;
      }
      
      // Emit generic keypress event
      if (!handled) {
        if (this._focused.emit('keypress', ch, key) === true) handled = true;
      }

      // Bubble unhandled key events up to parent elements
      if (!handled) {
        let parent = this._focused.parent;
        while (parent && parent !== this) {
          if (keyName && parent.emit(`keypress ${keyName}`, ch, key) === true) {
            handled = true;
            break;
          }
          if (!handled && parent.emit('keypress', ch, key) === true) {
            handled = true;
            break;
          }
          parent = parent.parent;
        }
      }
    }

    // Default Tab/Shift-Tab and Arrow keys for focus navigation (only if not handled by widget)
    if (!handled && this.options.focusKeys !== false) {
      const keyName = key.name;
      if (keyName === 'tab') {
        if (key.shift) {
          this.focusPrevious();
        } else {
          this.focusNext();
        }
        this.render();
        return;
      }
      
      // Arrow keys for focus navigation (only if not handled by widget)
      if (!key.shift && (keyName === 'up' || keyName === 'left')) {
        const prev = this._focused;
        this.focusPrevious();
        if (this._focused !== prev) {
          this.render();
          return;
        }
      }
      if (!key.shift && (keyName === 'down' || keyName === 'right')) {
        const prev = this._focused;
        this.focusNext();
        if (this._focused !== prev) {
          this.render();
          return;
        }
      }
    }

    if (!suppressGlobalKeys) {
      this.emit('keypress', ch, key);
    }
  }

  // ============================================================================
  // Title
  // ============================================================================

  setTitle(title: string): void {
    this.title = title;
    this.write(ESC + `]0;${title}` + String.fromCharCode(7));
  }

  // ============================================================================
  // Cursor
  // ============================================================================

  showCursor(): void {
    if (this.cursorHidden) {
      this.cursorHidden = false;
      this.write(cursor.show);
    }
  }

  hideCursor(): void {
    if (!this.cursorHidden) {
      this.cursorHidden = true;
      this.write(cursor.hide);
    }
  }

  /**
   * Set cursor style for web frontend (CSS cursor property)
   * Valid styles: 'default', 'pointer', 'text', 'move', 'grab', 'grabbing',
   *               'ew-resize', 'ns-resize', 'nesw-resize', 'nwse-resize',
   *               'col-resize', 'row-resize', 'crosshair', 'not-allowed'
   */
  setCursorStyle(style: string): void {
    if (this._cursorStyle === style) return;
    this._cursorStyle = style;
    // Emit event for frontend to update CSS cursor
    this.emit('cursor-style', style);
  }

  /**
   * Get current cursor style
   */
  getCursorStyle(): string {
    return this._cursorStyle;
  }

  // ============================================================================
  // Lifecycle
  // ============================================================================

  /**
   * Enter alternate buffer and initialize screen
   */
  enter(): void {
    this.program.alternateBuffer();
    this.program.hideCursor();
    this.clear();
    this.render();
    this.emit('enter');
  }

  /**
   * Leave alternate buffer and restore terminal
   */
  leave(): void {
    this.program.showCursor();
    this.program.normalBuffer();
    this.emit('leave');
  }

  // ============================================================================
  // Property Getters/Setters
  // ============================================================================

  /**
   * Get currently focused element
   */
  getFocused(): Element | null {
    return this._focused;
  }

  /**
   * Set focused element (called by Element.focus())
   */
  setFocused(element: Element | null): void {
    // Helper to find the element with a visible border (may be parent)
    const findBorderElement = (el: any): any => {
      if (!el) return null;
      // Check if element has a border with fg color
      if (el.options?.border && el.options?.border.type !== 'none') {
        return el;
      }
      // Walk up to parent (but stop at screen)
      if (el.parent && el.parent !== this) {
        return findBorderElement(el.parent);
      }
      return null;
    };

    // Blur previous focused element
    if (this._focused && this._focused !== element) {
      this._focused.focused = false;
      this._focused.emit('blur');

      // Restore original border color on blur
      const prevBorderEl = findBorderElement(this._focused);
      if (prevBorderEl && prevBorderEl._originalBorderColor) {
        // Update both options.style.border and style.border for consistency
        if (prevBorderEl.options?.style?.border) {
          prevBorderEl.options.style.border.fg = prevBorderEl._originalBorderColor;
          prevBorderEl.options.style.border.bold = prevBorderEl._originalBorderBold || false;
        }
        if (prevBorderEl.style?.border) {
          prevBorderEl.style.border.fg = prevBorderEl._originalBorderColor;
          prevBorderEl.style.border.bold = prevBorderEl._originalBorderBold || false;
        }
      }
    }

    // Focus new element
    this._focused = element;
    if (element) {
      element.focused = true;
      element.emit('focus');

      // Automatically set high-contrast borders on focused elements
      const borderEl = findBorderElement(element);
      if (borderEl) {
        // Store original border color if not already stored
        const currentStyle = borderEl.options?.style?.border || borderEl.style?.border || {};
        if (!borderEl._originalBorderColor) {
          borderEl._originalBorderColor = currentStyle.fg || 'cyan';
          borderEl._originalBorderBold = currentStyle.bold || false;
        }
        // Set yellow border for focused element (white is reserved for hover)
        if (borderEl.options?.style?.border) {
          borderEl.options.style.border.fg = 'yellow';
          borderEl.options.style.border.bold = true;
        }
        if (borderEl.style?.border) {
          borderEl.style.border.fg = 'yellow';
          borderEl.style.border.bold = true;
        }
      }
    }

    // Re-render to update focus border styling
    this.render();
  }

  /**
   * Get width (overrides Element.width for Screen)
   */
  get width(): number {
    return this._width;
  }

  /**
   * Set width
   */
  set width(value: number) {
    // Validate width is a positive finite number
    if (!isFinite(value) || value <= 0) {
      return;
    }
    this._width = value;
    this.program.cols = value;
  }

  /**
   * Get height (overrides Element.height for Screen)
   */
  get height(): number {
    return this._height;
  }

  /**
   * Set height
   */
  set height(value: number) {
    // Validate height is a positive finite number
    if (!isFinite(value) || value <= 0) {
      return;
    }
    this._height = value;
    this.program.rows = value;
  }

  /**
   * Get terminal type
   */
  get terminal(): string {
    return this.program.terminal;
  }

  /**
   * Get number of columns
   */
  get cols(): number {
    return this._width;
  }

  /**
   * Set number of columns
   */
  set cols(value: number) {
    this._width = value;
    this.program.cols = value;
    this.realloc();
  }

  /**
   * Get number of rows
   */
  get rows(): number {
    return this._height;
  }

  /**
   * Set number of rows
   */
  set rows(value: number) {
    this._height = value;
    this.program.rows = value;
    this.realloc();
  }

  // ============================================================================
  // Key Locking
  // ============================================================================

  private _lockKeys: boolean = false;

  /**
   * Lock key handlers (prevent input processing)
   */
  lockKeys(): void {
    this._lockKeys = true;
  }

  /**
   * Unlock key handlers
   */
  unlockKeys(): void {
    this._lockKeys = false;
  }

  // ============================================================================
  // Resize
  // ============================================================================

  /**
   * Resize the screen to new dimensions
   * Called when terminal size changes (e.g., browser window resize)
   */
  resize(cols: number, rows: number): void {
    // Validate dimensions
    if (!isFinite(cols) || cols <= 0 || !isFinite(rows) || rows <= 0) {
      return;
    }

    if (cols === this._width && rows === this._height) {
      return; // No change
    }

    const wasShrinking = cols < this._width || rows < this._height;

    // Enable responsive mode if resizing to wider than 80 columns
    if (cols > 80) {
      this._responsive = true;
    }

    this._width = cols;
    this._height = rows;
    this.program.cols = cols;
    this.program.rows = rows;

    // When shrinking, clear the terminal first to prevent line wrap artifacts
    // The old content rendered at larger width gets incorrectly wrapped otherwise
    if (wasShrinking) {
      // Clear entire screen and move cursor to home
      this.program.write(ESC + '[2J' + ESC + '[H');
    }

    // Reallocate buffers for new size
    this.realloc();

    // Invalidate all element coordinate caches after resize
    // This ensures elements recalculate their positions with new screen dimensions
    this.walk((el) => {
      (el as any)._coordsCacheValid = false;
    });

    // Emit resize event for elements that need to respond
    this.emit('resize');

    // Force full redraw
    this.render();
  }

  // ============================================================================
  // Utilities
  // ============================================================================

  private _colorToCode(color: any): number {
    if (typeof color === 'number') return color;

    const colors: Record<string, number> = {
      // Special - transparent means keep existing background
      transparent: 0x1ff,
      none: 0x1ff,
      default: 0x1ff,
      // Standard colors
      black: 0,
      red: 1,
      green: 2,
      yellow: 3,
      blue: 4,
      magenta: 5,
      cyan: 6,
      white: 7,
      // Bright colors
      gray: 8,
      grey: 8,
      lightblack: 8,
      lightred: 9,
      lightgreen: 10,
      lightyellow: 11,
      lightblue: 12,
      lightmagenta: 13,
      lightcyan: 14,
      lightwhite: 15,
    };

    const lowerColor = String(color).toLowerCase();
    return colors[lowerColor] !== undefined ? colors[lowerColor] : 7;
  }

  private _stripAnsi(str: string): string {
    // Use RegExp constructor to avoid Terser stripping ESC in regex literal
    const ansiRegex = new RegExp(ESC + '\\[[0-9;]*m', 'g');
    return str.replace(ansiRegex, '');
  }

  /**
   * Clear entire screen
   */
  clear(): void {
    this.clearBuffers();
    this.program.clear();
  }

  // ============================================================================
  // Advanced Features (External Programs, Effects, Screenshot)
  // ============================================================================

  /**
   * Spawn external program
   * NOTE: Browser environment stub - requires Node.js child_process
   * STUB from neo-blessed screen.js lines 1737-1798
   */
  spawn(file: string, args?: string[] | any, options?: any): any {
    throw new Error('spawn() not supported in browser environment - requires Node.js child_process');
  }

  /**
   * Execute external program and get success status
   * NOTE: Browser environment stub - requires Node.js child_process
   * STUB from neo-blessed screen.js lines 1800-1814
   */
  exec(file: string, args?: string[] | any, options?: any, callback?: (err: Error | null, success: boolean) => void): any {
    throw new Error('exec() not supported in browser environment - requires Node.js child_process');
  }

  /**
   * Open text editor and return edited content
   * NOTE: Browser environment stub - requires Node.js fs and child_process
   * STUB from neo-blessed screen.js lines 1816-1864
   */
  readEditor(options?: string | any, callback?: (err: Error | null, data?: string) => void): void {
    const err = new Error('readEditor() not supported in browser environment - requires Node.js fs/child_process');
    if (callback) callback(err);
    else throw err;
  }

  /**
   * Display image using external image viewer
   * NOTE: Browser environment stub - requires Node.js child_process and external w3mimgdisplay
   * STUB from neo-blessed screen.js lines 1866-1904
   */
  displayImage(file: string, callback?: (err: Error | null, success?: boolean) => void): void {
    const err = new Error('displayImage() not supported in browser environment - requires external w3mimgdisplay');
    if (callback) callback(err);
    else throw err;
  }

  /**
   * Set visual effects (hover, blur, focus) on element
   * EXACT from neo-blessed screen.js lines 1906-1957
   */
  setEffects(
    el: Element | (() => Element),
    fel: Element | (() => Element) | null,
    over: string,
    out: string,
    effects: any,
    temp?: string
  ): void {
    if (!effects) return;

    const tmp: Record<string, any> = {};
    if (temp && typeof el !== 'function') {
      (el as any)[temp] = tmp;
    }

    let getEl: () => Element;
    if (typeof el !== 'function') {
      const _el = el;
      getEl = () => _el;
    } else {
      getEl = el;
    }

    let getFel: (() => Element | null) | null = null;
    if (fel) {
      if (typeof fel !== 'function') {
        const _fel = fel;
        getFel = () => _fel;
      } else {
        getFel = fel;
      }
    }

    const $ = (name: string) => {
      return function (this: Element) {
        const _el = getEl();
        const _fel = getFel ? getFel() : null;
        const elStyle = (_el as any).style || {};
        const felStyle = _fel ? ((_fel as any).style || {}) : {};

        if (tmp[name] !== undefined) {
          elStyle[name] = tmp[name];
          delete tmp[name];
        }

        if (effects[name] !== undefined) {
          tmp[name] = elStyle[name];
          elStyle[name] = effects[name];
        }

        if (_fel && effects[name + 'Focus'] !== undefined) {
          tmp[name] = felStyle[name];
          felStyle[name] = effects[name + 'Focus'];
        }

        this.screen.render();
      };
    };

    getEl().on(over, $(over));
    getEl().on(out, $(out));
  }

  /**
   * Initialize hover text box
   * Creates tooltip-style box that appears on hover
   * EXACT from neo-blessed screen.js lines 615-672
   */
  _initHover(): void {
    if (this._hoverText) {
      return;
    }

    // Would require Box widget - deferred for now
    // Full implementation requires blessed Box widget with specific options
    // Hover text should appear at cursor position with auto-hide timer
    this._hoverText = null;
  }

  private _hoverText: any = null;

  /**
   * Take screenshot of screen buffer as text
   * Returns ANSI/plain text representation of current screen
   * EXACT from neo-blessed screen.js lines 2108-2197
   */
  screenshot(xi?: number, xl?: number, yi?: number, yl?: number, term?: boolean): string {
    if (xi == null) xi = 0;
    if (xl == null) xl = this.cols;
    if (yi == null) yi = 0;
    if (yl == null) yl = this.rows;

    if (xi < 0) xi = 0;
    if (yi < 0) yi = 0;

    let main = '';
    for (let y = yi; y < yl; y++) {
      let line = '';
      for (let x = xi; x < xl; x++) {
        const cell = this.buffer[y]?.[x];
        if (cell && cell.length >= 2) {
          line += cell[1] || ' ';  // cell[0] = attr, cell[1] = char
        } else {
          line += ' ';
        }
      }
      main += line;
      if (y < yl - 1) main += '\n';
    }

    return main;
  }

  // ============================================================================
  // Cleanup
  // ============================================================================

  destroy(): void {
    if (this.destroyed) return;

    // Clear pending render timer to prevent firing after destroy
    if (this._renderTimer) {
      clearTimeout(this._renderTimer);
      this._renderTimer = null;
    }

    // Remove browser context menu handler
    if (this._contextMenuHandler) {
      const doc = typeof globalThis !== 'undefined' ? (globalThis as any).document : undefined;
      if (doc) {
        doc.removeEventListener('contextmenu', this._contextMenuHandler, true);
      }
      this._contextMenuHandler = null;
    }

    this.write(cursor.show);
    this.write(screenAnsi.clear);
    this.write(cursor.pos(0, 0));
    this.write(attrs.reset);
    this.flush();

    // Destroy program
    this.program.destroy();

    super.destroy();
  }

  /**
   * Handle input data (forward to program)
   */
  _handleData(data: string): void {
    this.program._handleData(data);
  }
}

const ANGLES: Record<string, boolean> = {
  '┘': true,
  '┐': true,
  '┌': true,
  '└': true,
  '┼': true,
  '├': true,
  '┤': true,
  '┴': true,
  '┬': true,
  '│': true,
  '─': true,
};

const L_ANGLES: Record<string, boolean> = {
  '┌': true,
  '└': true,
  '┼': true,
  '├': true,
  '┴': true,
  '┬': true,
  '─': true,
};

const U_ANGLES: Record<string, boolean> = {
  '┐': true,
  '┌': true,
  '┼': true,
  '├': true,
  '┤': true,
  '┬': true,
  '│': true,
};

const R_ANGLES: Record<string, boolean> = {
  '┘': true,
  '┐': true,
  '┼': true,
  '┤': true,
  '┴': true,
  '┬': true,
  '─': true,
};

const D_ANGLES: Record<string, boolean> = {
  '┘': true,
  '└': true,
  '┼': true,
  '├': true,
  '┤': true,
  '┴': true,
  '│': true,
};

const ANGLE_TABLE: Record<number, string> = {
  0: '',
  1: '│',
  2: '─',
  3: '┌',
  4: '│',
  5: '│',
  6: '└',
  7: '├',
  8: '─',
  9: '┐',
  10: '─',
  11: '┬',
  12: '┘',
  13: '┤',
  14: '┴',
  15: '┼',
};
