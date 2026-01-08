/**
 * DockablePanel - Movable, resizable, dockable panel widget
 *
 * Features:
 * - Drag and drop to reposition
 * - Edge docking (top, bottom, left, right, center)
 * - Floating panels with z-index management
 * - Minimize/maximize with animations
 * - Resize handles for floating panels
 * - Mouse and keyboard control
 */

import { Panel, PanelOptions } from './panel';
import { Box } from './box';
import { Button } from './button';
import type { Element } from '../core/element';
import type { Screen } from '../core/screen';

export type DockPosition = 'top' | 'bottom' | 'left' | 'right' | 'center' | 'float';

export interface DockablePanelOptions extends PanelOptions {
  dockPosition?: DockPosition;
  allowFloat?: boolean;
  allowResize?: boolean;
  allowMinimize?: boolean;
  allowAutoDock?: boolean;  // Auto-dock when dragged near screen edges (default: true)
  minimized?: boolean;
  resizable?: boolean;
  draggable?: boolean;
  showMinimizeButton?: boolean;
  showCloseButton?: boolean;
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
  zIndex?: number;
  persistenceKey?: string;
  topConstraint?: number; // Minimum 'top' coordinate allowed
  bottomConstraint?: number; // Minimum space from bottom
  fitContent?: boolean | { width?: boolean; height?: boolean };  // Auto-resize to fit content (default: true)
}

export interface PanelState {
  position: DockPosition;
  minimized: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  // Saved state for restore after minimize
  savedWidth?: number;
  savedHeight?: number;
  savedX?: number;
  savedY?: number;
  // Original dock position before dragging (for swapping)
  originalDockPosition?: DockPosition;
}

interface ResizeNeighbor {
  panel: DockablePanel;
  edge: string; // Edge of the neighbor that touches our dragged edge
  startLeft: number;
  startTop: number;
  startWidth: number;
  startHeight: number;
}

/**
 * DockablePanel widget
 */
export class DockablePanel extends Panel {
  private dockPosition: DockPosition;
  private panelState: PanelState;
  private isDragging: boolean = false;
  private isResizing: boolean = false;
  private dragStartX: number = 0;
  private dragStartY: number = 0;
  private dragStartLeft: number = 0;
  private dragStartTop: number = 0;
  private dragStartWidth: number = 0;
  private dragStartHeight: number = 0;
  private resizeNeighbors: ResizeNeighbor[] = [];
  private minimizeButton?: Element;
  private closeButton?: Element;
  private titleBar?: Element;
  private minimizedBar?: Element;
  private minWidth?: number;
  private maxWidth?: number;
  private minHeight?: number;
  private maxHeight?: number;
  private resizable: boolean;
  private allowAutoDock: boolean;
  private currentResizeEdge: string | null = null;
  private ghostBox?: Element;
  private persistenceKey?: string;
  private topConstraint: number = 0;
  private bottomConstraint: number = 0;
  private tabs: DockablePanel[] = [];
  private activeTab: number = 0;
  private tabButtons: any[] = [];
  private preMaximizeState: Partial<PanelState> | null = null;
  private mobileMode: boolean = false;
  private fitContentSettings: { width: boolean; height: boolean };

  private screenListenersBound: boolean = false;

  constructor(options: DockablePanelOptions = {}) {
    super({
      ...options,
      draggable: options.draggable !== false,
      mouse: true,
      keys: true,
      clickable: true,  // Enable click events for panel activation
    });

    this.dockPosition = options.dockPosition || 'float';
    this.panelState = {
      position: this.dockPosition,
      minimized: options.minimized || false,
      x: typeof this.left === 'number' ? this.left : 0,
      y: typeof this.top === 'number' ? this.top : 0,
      width: typeof this.width === 'number' ? this.width : 40,
      height: typeof this.height === 'number' ? this.height : 20,
      zIndex: options.zIndex || 100,
    };

    // Store min/max constraints locally (not in ElementOptions)
    // These are used in resize handling
    this.minWidth = options.minWidth;
    this.maxWidth = options.maxWidth;
    this.minHeight = options.minHeight;
    this.maxHeight = options.maxHeight;
    this.resizable = options.resizable !== false;
    this.allowAutoDock = options.allowAutoDock !== false;  // Default: true (enabled)
    this.persistenceKey = options.persistenceKey;
    this.topConstraint = options.topConstraint || 0;
    this.bottomConstraint = options.bottomConstraint || 0;

    // Initialize fitContent settings (default: enabled for both width and height)
    if (options.fitContent === false) {
      this.fitContentSettings = { width: false, height: false };
    } else if (typeof options.fitContent === 'object') {
      this.fitContentSettings = {
        width: options.fitContent.width !== false,  // default true
        height: options.fitContent.height !== false,  // default true
      };
    } else {
      // Default: enabled for both
      this.fitContentSettings = { width: true, height: true };
    }

    // Suppress the border label from the base Panel/Box class
    // DockablePanel uses its own titleBar widget for the title
    this.options.label = undefined;
    if (this.style && (this as any)._originalBorderColor === undefined) {
       (this as any)._originalBorderColor = this.style.border?.fg || 'blue';
    }

    this.setupTitleBar(options);
    this.setupDocking();
    this.setupDragging();
    this.setupResizing();

    // Automatic state persistence
    if (this.persistenceKey) {
      this.on('drag-end', () => { void this.saveState(); });
      this.on('resize-end', () => { void this.saveState(); });
      this.on('dock', () => { void this.saveState(); });
      this.on('minimize', () => { void this.saveState(); });
      this.on('maximize', () => { void this.saveState(); });
    }

    // Focus panel when clicked anywhere on it (including when children are clicked)
    this.on('click', () => {
      this.focus();
      this.emit('activate');
    });

    if (this.panelState.minimized) {
      this.minimize();
    }

    // Defer screen event binding until element is attached to a screen
    // The screen may not be available at construction time
    this.on('attach', () => {
      this.bindScreenEvents();
      if (this.persistenceKey) {
        this.loadState().then(() => {
          if (this.screen) this.screen.render();
        });
      }
    });

    // Also try to bind immediately if screen is already available
    if (this.screen) {
      this.bindScreenEvents();
    }

    // Ensure title bar renders on top of resize handles
    this.bringUIToFront();
  }

  /**
   * Override append to ensure UI elements (title bar, resize handles) stay on top
   * When user content is added as children, we need to reorder so our UI is rendered last
   * Also triggers fitToContent if enabled
   */
  append(element: Element): void {
    super.append(element);
    this.bringUIToFront();

    // Auto-fit content when children are added
    if (this.fitContentSettings?.width || this.fitContentSettings?.height) {
      // Listen for content changes on the child to re-fit
      (element as any).on?.('set content', () => {
        this.scheduleFitToContent();
      });

      // Schedule fit after append (deferred to allow child to render)
      this.scheduleFitToContent();
    }
  }

  /**
   * Schedule a fitToContent call (debounced to avoid multiple rapid calls)
   */
  private _fitContentTimer?: ReturnType<typeof setTimeout>;
  private scheduleFitToContent(): void {
    if (this._fitContentTimer) {
      clearTimeout(this._fitContentTimer);
    }
    this._fitContentTimer = setTimeout(() => {
      this.fitToContent();
      this._fitContentTimer = undefined;
    }, 10);
  }

  /**
   * Bring title bar to front (rendered last = on top)
   */
  private bringUIToFront(): void {
    // Title bar and its buttons should be on top
    if (this.titleBar) {
      const idx = this.children.indexOf(this.titleBar);
      if (idx !== -1 && idx !== this.children.length - 1) {
        this.children.splice(idx, 1);
        this.children.push(this.titleBar);
      }
    }
  }

  /**
   * Bind mouse event handlers to the screen for dragging and resizing
   * This is called when the element is attached to a screen
   */
  private bindScreenEvents(): void {
    if (this.screenListenersBound || !this.screen) return;
    this.screenListenersBound = true;

    // Drag handlers
    this.screen.on('mousemove', (data: any) => {
      if (this.isDragging) {
        this.handleDrag(data.x, data.y);
      }
      if (this.isResizing && this.currentResizeEdge) {
        this.handleResizeFromEdge(this.currentResizeEdge, data.x, data.y);
      }
    });

    this.screen.on('mouseup', () => {
      if (this.isDragging) {
        this.stopDrag();
      }
      if (this.isResizing) {
        this.stopResize();
      }
    });

    // Screen resize handler - update docked panels and constrain floating panels
    this.screen.on('resize', () => {
      // Check for mobile mode (Auto-Flow)
      const breakpoint = this.screen.responsiveLayout.getBreakpoint();
      const isMobile = breakpoint === 'xs';
      
      if (isMobile) {
        this.mobileMode = true;
        // In mobile mode, panels fill the available screen area
        this.setState({
          x: 0,
          y: this.topConstraint,
          width: this.screen.width,
          height: this.screen.height - this.topConstraint - 1, // Leave space for status bar
          position: 'float'
        });
      } else if (this.mobileMode) {
        this.mobileMode = false;
        // Restore from mobile mode (return to original position or dock)
        this.applyDockPosition(this.dockPosition);
      }

      if (!isMobile) {
        if (this.dockPosition !== 'float') {
          // Re-apply dock position to recalculate dimensions
          this.applyDockPosition(this.dockPosition);
        } else {
          // For floating panels, ensure they stay within screen bounds
          this.constrainToScreen();
        }
      }
    });
  }

  /**
   * Constrain floating panel to stay within screen bounds
   */
  private constrainToScreen(): void {
    if (!this.screen) return;

    const currentLeft = typeof this.position.left === 'number' ? this.position.left : 0;
    const currentTop = typeof this.position.top === 'number' ? this.position.top : 0;
    const currentWidth = typeof this.position.width === 'number' ? this.position.width : this.width;
    const currentHeight = typeof this.position.height === 'number' ? this.position.height : this.height;

    // Calculate max height based on constraints
    const maxScreenHeight = this.screen.height - this.topConstraint - this.bottomConstraint;

    // Ensure panel doesn't extend beyond screen bounds
    let newLeft = Math.max(0, Math.min(currentLeft, this.screen.width - currentWidth));
    // Respect top constraint for position
    let newTop = Math.max(this.topConstraint, Math.min(currentTop, this.screen.height - currentHeight - this.bottomConstraint));

    // If panel is larger than screen, resize it
    let newWidth = Math.min(currentWidth, this.screen.width);
    // Respect height constraints
    let newHeight = Math.min(currentHeight, maxScreenHeight);

    // Apply min constraints
    if (this.minWidth) newWidth = Math.max(newWidth, this.minWidth);
    if (this.minHeight) newHeight = Math.max(newHeight, this.minHeight);

    this.position.left = newLeft;
    this.position.top = newTop;
    this.position.width = newWidth;
    this.position.height = newHeight;

    this._invalidateCoords();
  }

  private setupTitleBar(options: DockablePanelOptions): void {
    if (!options.label && !options.title && !options.showMinimizeButton && !options.showCloseButton) {
      return;
    }

    // Ensure border label is suppressed
    this.options.label = undefined;

    // Create title bar
    this.titleBar = new Box({
      parent: this,
      top: 0,
      left: 0,
      width: '100%-2',  // Account for panel borders
      height: 1,
      tags: true,
      mouse: true,  // Required for drag events
      style: {
        fg: 'white',
        bg: 'blue',
      },
      content: options.label || options.title || 'Panel',
    });

    // Make title bar draggable and double-click to restore from minimized
    if (this.titleBar) {
      // Double-click to restore when minimized
      this.titleBar.on('click', () => {
        if (this.panelState.minimized) {
          this.maximize();
        }
      });

      // Drag to move (only when not minimized)
      if (options.draggable !== false) {
        this.titleBar.on('mousedown', (data: any) => {
          if (!this.panelState.minimized) {
            this.startDrag(data.x, data.y);
          }
        });
      }
    }

    // Add minimize button
    if (options.showMinimizeButton !== false) {
      this.minimizeButton = new Button({
        parent: this.titleBar,
        right: (options.showCloseButton !== false ? 4 : 1),
        top: 0,
        width: 3,
        height: 1,
        content: '[_]', // Minimize icon
        border: { type: 'none' },  // No border for inline title bar button
        padding: 0,     // No padding - content fills the space
        style: {
          fg: 'yellow',
          bg: 'blue',
          focus: {
            fg: 'white',
            bg: 'lightblue',
          },
          hover: {
            fg: 'white',
            bg: 'lightblue',
          },
        },
      });

      this.minimizeButton!.on('press', () => {
        this.toggleMinimize();
      });
    }

    // Add close button
    if (options.showCloseButton) {
      this.closeButton = new Button({
        parent: this.titleBar,
        right: 1,
        top: 0,
        width: 3,
        height: 1,
        content: '[X]',
        border: { type: 'none' },  // No border for inline title bar button
        padding: 0,     // No padding - content fills the space
        style: {
          fg: 'white',
          bg: 'red',
          focus: {
            fg: 'white',
            bg: 'darkred',
          },
          hover: {
            fg: 'white',
            bg: 'darkred',
          },
        },
      });

      this.closeButton!.on('press', () => {
        this.emit('close');
        this.destroy();
      });
    }
  }

  /**
   * Setup docking behavior
   */
  private setupDocking(): void {
    this.applyDockPosition(this.dockPosition);
  }

  /**
   * Setup dragging behavior
   * Note: Screen-level mousemove/mouseup handlers are set up in bindScreenEvents()
   */
  private setupDragging(): void {
    this.on('mousedown', (data: any) => {
      // Don't start drag if clicking on a resize edge (handled by setupResizing)
      if (this.resizable) {
        const edge = this.detectResizeEdge(data.x, data.y);
        if (edge) {
          return; // Let resize handling process this event
        }
      }

      // Only start drag from title bar or if no title bar exists
      if (!this.titleBar || data.y === 0) {
        this.startDrag(data.x, data.y);
      }
    });
  }

  /**
   * Setup resizing behavior on panel borders
   * No separate gadgets - uses the panel's own border for resize detection
   * Top row is reserved for title bar (drag to move)
   */
  private setupResizing(): void {
    if (!this.resizable) return;

    // Handle mousedown on panel - detect if click is on border edge/corner
    this.on('mousedown', (data: any) => {
      const edge = this.detectResizeEdge(data.x, data.y);
      if (edge) {
        this.startResizeFromEdge(edge, data.x, data.y);
      }
    });

    // Handle mousemove for hover effect on borders
    this.on('mousemove', (data: any) => {
      const edge = this.detectResizeEdge(data.x, data.y);
      this.updateBorderHover(edge);
    });

    // Reset hover when mouse leaves panel
    this.on('mouseout', () => {
      this.updateBorderHover(null);
    });
  }

  /**
   * Detect which resize edge/corner the mouse is over
   * Returns edge name or null if not on a resize area
   */
  private detectResizeEdge(mouseX: number, mouseY: number): string | null {
    // Get panel's absolute screen coordinates
    const coords = this._getCoords();
    if (!coords) return null;

    const panelLeft = coords.xi;
    const panelTop = coords.yi;
    const panelRight = coords.xl - 1;
    const panelBottom = coords.yl - 1;

    // Calculate relative position within panel
    const relX = mouseX - panelLeft;
    const relY = mouseY - panelTop;
    const width = panelRight - panelLeft + 1;
    const height = panelBottom - panelTop + 1;

    const onLeft = relX === 0;
    const onRight = relX === width - 1;
    const onTop = relY === 0;
    const onBottom = relY === height - 1;

    // Detect corners (high priority)
    if (onTop && onLeft) return 'nw';
    if (onTop && onRight) return 'ne';
    if (onBottom && onLeft) return 'sw';
    if (onBottom && onRight) return 'se';

    // Detect edges
    if (onTop) return 'n';
    if (onBottom) return 's';
    if (onLeft) return 'w';
    if (onRight) return 'e';

    return null;
  }

  /**
   * Find sibling panels that share an edge with the edge we are dragging
   */
  private findResizeNeighbors(edge: string): ResizeNeighbor[] {
    if (!this.parent) return [];

    const neighbors: ResizeNeighbor[] = [];
    const myPos = this._getCoords();
    if (!myPos) return [];

    // Increase tolerance to 2 to catch shared borders (overlap)
    const TOLERANCE = 2;

    for (const sibling of this.parent.children) {
      if (!(sibling instanceof DockablePanel) || sibling === this) continue;
      if (sibling.isMinimized()) continue;

      const sPos = sibling._getCoords();
      if (!sPos) continue;

      let touches = false;
      let touchingEdge = '';

      // If we drag our RIGHT edge (xl), find neighbors whose LEFT edge (xi) is near our RIGHT
      if (edge === 'e') {
        if (Math.abs(sPos.xi - (myPos.xl - 1)) <= TOLERANCE || Math.abs(sPos.xi - myPos.xl) <= TOLERANCE) {
          touches = true;
          touchingEdge = 'w';
        }
      }
      // If we drag our LEFT edge (xi), find neighbors whose RIGHT edge (xl-1) is near our LEFT
      else if (edge === 'w') {
        if (Math.abs((sPos.xl - 1) - myPos.xi) <= TOLERANCE || Math.abs(sPos.xl - myPos.xi) <= TOLERANCE) {
          touches = true;
          touchingEdge = 'e';
        }
      }
      // If we drag our BOTTOM edge (yl), find neighbors whose TOP edge (yi) is near our BOTTOM
      else if (edge === 's') {
        if (Math.abs(sPos.yi - (myPos.yl - 1)) <= TOLERANCE || Math.abs(sPos.yi - myPos.yl) <= TOLERANCE) {
          touches = true;
          touchingEdge = 'n';
        }
      }
      // If we drag our TOP edge (yi), find neighbors whose BOTTOM edge (yl-1) is near our TOP
      else if (edge === 'n') {
        if (Math.abs((sPos.yl - 1) - myPos.yi) <= TOLERANCE || Math.abs(sPos.yl - myPos.yi) <= TOLERANCE) {
          touches = true;
          touchingEdge = 's';
        }
      }

      if (touches) {
        neighbors.push({
          panel: sibling,
          edge: touchingEdge,
          startLeft: sibling.aleft,
          startTop: sibling.atop,
          startWidth: sibling.width,
          startHeight: sibling.height,
        });
      }
    }

    return neighbors;
  }

  /**
   * Update border color based on hover state
   */
  private updateBorderHover(edge: string | null): void {
    // Use the base class's _overBorder state for consistent rendering
    const isOver = !!edge;
    if ((this as any)._overBorder !== isOver) {
      (this as any)._overBorder = isOver;
      if (this.screen) {
        this.screen.render();
      }
    }
  }

  /**
   * Show visual resize cursor (no-op - handles are invisible)
   */
  private showResizeCursor(_edge: string): void {
    // Resize handles are now invisible overlays - no cursor content needed
  }

  /**
   * Hide visual resize cursor (no-op - handles are invisible)
   */
  private hideResizeCursor(): void {
    // Resize handles are now invisible overlays - no cursor content needed
  }

  /**
   * Start dragging
   */
  private startDrag(x: number, y: number): void {
    if (this.panelState.minimized) return;

    this.isDragging = true;
    this.dragStartX = x;
    this.dragStartY = y;
    this.dragStartLeft = typeof this.left === 'number' ? this.left : 0;
    this.dragStartTop = typeof this.top === 'number' ? this.top : 0;

    // Visual feedback: Change border color and enable transparency during drag
    if (this.style) {
      if (this.style.border) {
        this.style.border.fg = 'yellow';
      }
      // Enable transparent mode during drag for visual feedback
      (this.style as any).transparent = true;
    }
    // Emit overlay event for web client to apply CSS opacity
    if ((this as any)._emitOverlayEvent) {
      (this as any)._emitOverlayEvent(true);
    }
    if (this.titleBar && this.titleBar.style) {
      this.titleBar.style.bg = 'cyan';
    }

    // Bring to front
    this.bringToFront();

    // Save original dock position before undocking (for panel swapping)
    if (this.dockPosition !== 'float') {
      this.panelState.originalDockPosition = this.dockPosition;
      this.setDockPosition('float');
    } else {
      // Already floating, no original position to save
      this.panelState.originalDockPosition = undefined;
    }

    this.emit('drag-start');
  }

  /**
   * Handle dragging
   */
  private handleDrag(x: number, y: number): void {
    const deltaX = x - this.dragStartX;
    const deltaY = y - this.dragStartY;

    let newLeft = this.dragStartLeft + deltaX;
    let newTop = this.dragStartTop + deltaY;

    // Sanitize coordinates
    if (isNaN(newLeft)) newLeft = this.dragStartLeft;
    if (isNaN(newTop)) newTop = this.dragStartTop;

    // Constrain to screen bounds (ensure at least a 3x3 'handle' remains on screen)
    if (this.screen) {
      const VISIBLE_HANDLE = 3;
      const sw = this.screen.width;
      const sh = this.screen.height;
      const pw = (this.width as number) || 40;
      const ph = (this.height as number) || 20;

      newLeft = Math.max(VISIBLE_HANDLE - pw, Math.min(newLeft, sw - VISIBLE_HANDLE));
      newTop = Math.max(this.topConstraint, Math.min(newTop, sh - VISIBLE_HANDLE)); // Respect topConstraint
    }

    // Use position.* for runtime updates (not options.* which is only read at construction)
    this.position.left = newLeft;
    this.position.top = newTop;
    this.panelState.x = newLeft;
    this.panelState.y = newTop;

    // Invalidate coordinate cache for all children so they recalculate positions
    this._invalidateCoords();

    if (this.screen) {
      this.screen.lock();
      // Show snap preview ghost area
      this.updateSnapPreview(x, y);
      this.screen.unlock();
    }

    this.emit('drag', { x: this.left, y: this.top });
  }

  /**
   * Stop dragging
   */
  private stopDrag(): void {
    this.isDragging = false;

    // Restore border color and disable transparency
    if (this.style) {
      if (this.style.border) {
        const borderOptions = this.options.border as any;
        this.style.border.fg = borderOptions?.fg || 'green';
      }
      // Restore original transparent state (default to false)
      (this.style as any).transparent = (this.options.style as any)?.transparent || false;
    }
    // Emit overlay event to disable CSS opacity
    if ((this as any)._emitOverlayEvent) {
      (this as any)._emitOverlayEvent(false);
    }
    if (this.titleBar && this.titleBar.style) {
      this.titleBar.style.bg = 'blue';
    }
    if (this.allowAutoDock) {
      this.checkEdgeDocking();
    }

    this.removeSnapPreview();

    if (this.screen) {
      this.screen.render();
    }

    this.emit('drag-end');
  }

  /**
   * Start resizing from a specific edge
   */
  private startResizeFromEdge(edge: string, x: number, y: number): void {
    this.isResizing = true;
    this.currentResizeEdge = edge;
    this.dragStartX = x;
    this.dragStartY = y;
    this.dragStartLeft = typeof this.left === 'number' ? this.left : 0;
    this.dragStartTop = typeof this.top === 'number' ? this.top : 0;
    // CRITICAL: Save initial width/height - used for delta calculations during resize
    this.dragStartWidth = typeof this.width === 'number' ? this.width : 40;
    this.dragStartHeight = typeof this.height === 'number' ? this.height : 20;

    // Find adjacent panels to resize together
    this.resizeNeighbors = this.findResizeNeighbors(edge);

    // Visual feedback: Use base _overBorder state for consistency
    (this as any)._overBorder = true;

    if (this.titleBar && this.titleBar.style) {
      this.titleBar.style.bg = 'cyan';
    }

    this.emit('resize-start');
  }

  /**
   * Handle resizing from a specific edge
   */
  private handleResizeFromEdge(edge: string, x: number, y: number): void {
    // Only calculate the delta that's relevant for this edge to avoid glitches
    // Horizontal edges (e, w) only use deltaX - ignore vertical mouse movement
    // Vertical edges (n, s) only use deltaY - ignore horizontal mouse movement
    // Corners use both
    const isHorizontalOnly = edge === 'e' || edge === 'w';
    const isVerticalOnly = edge === 'n' || edge === 's';

    const deltaX = isVerticalOnly ? 0 : (x - this.dragStartX);
    const deltaY = isHorizontalOnly ? 0 : (y - this.dragStartY);

    // CRITICAL: Use saved start dimensions, not current (which change during resize)
    let newWidth = this.dragStartWidth;
    let newHeight = this.dragStartHeight;
    let newLeft = this.dragStartLeft;
    let newTop = this.dragStartTop;

    // Calculate new dimensions based on which edge is being dragged
    switch (edge) {
      case 'nw': // North-West corner
        newWidth = this.dragStartWidth - deltaX;
        newHeight = this.dragStartHeight - deltaY;
        newLeft = this.dragStartLeft + deltaX;
        newTop = this.dragStartTop + deltaY;
        break;
      case 'ne': // North-East corner
        newWidth = this.dragStartWidth + deltaX;
        newHeight = this.dragStartHeight - deltaY;
        newTop = this.dragStartTop + deltaY;
        break;
      case 'sw': // South-West corner
        newWidth = this.dragStartWidth - deltaX;
        newHeight = this.dragStartHeight + deltaY;
        newLeft = this.dragStartLeft + deltaX;
        break;
      case 'se': // South-East corner
        newWidth = this.dragStartWidth + deltaX;
        newHeight = this.dragStartHeight + deltaY;
        break;
      case 'n': // North edge
        newHeight = this.dragStartHeight - deltaY;
        newTop = this.dragStartTop + deltaY;
        break;
      case 's': // South edge
        newHeight = this.dragStartHeight + deltaY;
        break;
      case 'w': // West edge
        newWidth = this.dragStartWidth - deltaX;
        newLeft = this.dragStartLeft + deltaX;
        break;
      case 'e': // East edge
        newWidth = this.dragStartWidth + deltaX;
        break;
    }

    // Apply min/max constraints
    const ABS_MIN_WIDTH = 5;
    const ABS_MIN_HEIGHT = 3;
    const effectiveMinWidth = Math.max(ABS_MIN_WIDTH, this.minWidth || 0);
    const effectiveMinHeight = Math.max(ABS_MIN_HEIGHT, this.minHeight || 0);

    // Sanitize calculations
    if (isNaN(newWidth)) newWidth = this.dragStartWidth;
    if (isNaN(newHeight)) newHeight = this.dragStartHeight;
    if (isNaN(newLeft)) newLeft = this.dragStartLeft;
    if (isNaN(newTop)) newTop = this.dragStartTop;

    if (newWidth < effectiveMinWidth) {
      if (edge.includes('w')) {
        newLeft = this.dragStartLeft + (this.dragStartWidth - effectiveMinWidth);
      }
      newWidth = effectiveMinWidth;
    }

    if (this.maxWidth && newWidth > this.maxWidth) {
      if (edge.includes('w')) {
        newLeft = this.dragStartLeft + (this.dragStartWidth - this.maxWidth);
      }
      newWidth = this.maxWidth;
    }

    if (newHeight < effectiveMinHeight) {
      if (edge.includes('n')) {
        newTop = this.dragStartTop + (this.dragStartHeight - effectiveMinHeight);
      }
      newHeight = effectiveMinHeight;
    }

    if (this.maxHeight && newHeight > this.maxHeight) {
      if (edge.includes('n')) {
        newTop = this.dragStartTop + (this.dragStartHeight - this.maxHeight);
      }
      newHeight = this.maxHeight;
    }

    // Constrain position to screen bounds
    if (this.screen) {
      newLeft = Math.max(0, Math.min(newLeft, this.screen.width - 1));
      newTop = Math.max(this.topConstraint, Math.min(newTop, this.screen.height - 1));
    }

    // Sanitize final values
    newWidth = Math.max(1, newWidth);
    newHeight = Math.max(1, newHeight);

    // Use position.* for runtime updates (not options.* which is only read at construction)
    this.position.width = newWidth;
    this.position.height = newHeight;
    this.position.left = newLeft;
    this.position.top = newTop;

    if (this.screen) {
      this.screen.lock();
    }

    // ----- Adjacent Resizing Logic -----
    for (const neighbor of this.resizeNeighbors) {
      let nWidth = neighbor.startWidth;
      let nHeight = neighbor.startHeight;
      let nLeft = neighbor.startLeft;
      let nTop = neighbor.startTop;

      const nMinWidth = neighbor.panel.minWidth || 5;
      const nMinHeight = neighbor.panel.minHeight || 3;

      if (edge === 'e') { // Dragging my right edge -> Neighbor's left edge
        const pWidth = neighbor.startWidth - deltaX;
        if (pWidth >= nMinWidth) {
          nWidth = pWidth;
          nLeft = neighbor.startLeft + deltaX;
        } else {
          const maxDelta = neighbor.startWidth - nMinWidth;
          this.position.width = this.dragStartWidth + maxDelta;
          newWidth = this.position.width as number;
          nWidth = nMinWidth;
          nLeft = neighbor.startLeft + maxDelta;
        }
      } 
      else if (edge === 'w') { // Dragging my left edge -> Neighbor's right edge
        const pWidth = neighbor.startWidth + deltaX;
        if (pWidth >= nMinWidth) {
          nWidth = pWidth;
        } else {
          const maxDelta = nMinWidth - neighbor.startWidth; // deltaX is negative
          this.aleft = this.dragStartLeft + maxDelta;
          this.position.width = this.dragStartWidth - maxDelta;
          newWidth = this.position.width as number;
          newLeft = this.aleft;
          nWidth = nMinWidth;
        }
      }
      else if (edge === 's') { // Dragging my bottom edge -> Neighbor's top edge
        const pHeight = neighbor.startHeight - deltaY;
        if (pHeight >= nMinHeight) {
          nHeight = pHeight;
          nTop = neighbor.startTop + deltaY;
        } else {
          const maxDelta = neighbor.startHeight - nMinHeight;
          this.position.height = this.dragStartHeight + maxDelta;
          newHeight = this.position.height as number;
          nHeight = nMinHeight;
          nTop = neighbor.startTop + maxDelta;
        }
      }
      else if (edge === 'n') { // Dragging my top edge -> Neighbor's bottom edge
        const pHeight = neighbor.startHeight + deltaY;
        if (pHeight >= nMinHeight) {
          nHeight = pHeight;
        } else {
          const maxDelta = nMinHeight - neighbor.startHeight; // deltaY is negative
          this.atop = this.dragStartTop + maxDelta;
          this.position.height = this.dragStartHeight - maxDelta;
          newHeight = this.position.height as number;
          newTop = this.atop;
          nHeight = nMinHeight;
        }
      }

      neighbor.panel.width = nWidth;
      neighbor.panel.height = nHeight;
      neighbor.panel.aleft = nLeft;
      neighbor.panel.atop = nTop;
      neighbor.panel._invalidateCoords();
    }

    if (this.screen) {
      this.screen.unlock();
    }

    this.panelState.width = this.position.width as number;
    this.panelState.height = this.position.height as number;
    this.panelState.x = this.position.left as number;
    this.panelState.y = this.position.top as number;

    // Invalidate coordinate cache for all children so they recalculate positions
    this._invalidateCoords();

    if (this.screen) {
      // Force full redraw to ensure borders are properly rendered after resize
      // This prevents artifacts where the right border disappears during resize
      this.screen.forceFullRedraw();
      this.screen.render();
    }

    this.emit('resize', { width: newWidth, height: newHeight, x: newLeft, y: newTop });
  }

  /**
   * Stop resizing
   */
  private stopResize(): void {
    this.isResizing = false;
    this.currentResizeEdge = null;

    // Reset visual feedback
    (this as any)._overBorder = false;

    if (this.titleBar && this.titleBar.style) {
      this.titleBar.style.bg = 'blue';
    }

    this.hideResizeCursor();

    // Disable auto-fit after manual resize (user explicitly set a size)
    this.fitContentSettings = { width: false, height: false };

    if (this.screen) {
      this.screen.render();
    }

    this.emit('resize-end');
  }

  /**
   * Check if panel should dock to an edge or swap with another panel
   */
  private checkEdgeDocking(): void {
    if (!this.screen) return;

    const threshold = 5;
    const x = this.aleft;
    const y = this.atop;
    const w = this.width;
    const h = this.height;
    const sw = this.screen.width;
    const sh = this.screen.height;

    // Check for swapping first
    const swapped = this.checkPanelSwap();
    if (swapped) {
      this.panelState.originalDockPosition = undefined;
      return;
    }

    // Check for center merge (overlap > 50%)
    for (const child of this.screen.children) {
      if (!(child instanceof DockablePanel) || child === this) continue;
      
      const other = child as DockablePanel;
      if (other.isMinimized()) continue;

      const oPos = other._getCoords();
      if (!oPos) continue;

      const myCenterX = x + w / 2;
      const myCenterY = y + h / 2;

      // If our center is inside their inner area, merge
      if (myCenterX > oPos.xi + 5 && myCenterX < oPos.xl - 5 &&
          myCenterY > oPos.yi + 2 && myCenterY < oPos.yl - 2) {
        other.mergeWith(this);
        this.panelState.originalDockPosition = undefined;
        return;
      }
    }

    // Determine which edges are within threshold
    const nearLeft = x <= threshold;
    const nearRight = (x + w) >= sw - threshold;
    const nearTop = y <= threshold;
    const nearBottom = (y + h) >= sh - threshold;

    // Calculate distances to find the "best" edge
    const dists = [
      { pos: 'left' as DockPosition, dist: x },
      { pos: 'right' as DockPosition, dist: sw - (x + w) },
      { pos: 'top' as DockPosition, dist: y },
      { pos: 'bottom' as DockPosition, dist: sh - (y + h) }
    ].filter(d => d.dist <= threshold)
     .sort((a, b) => a.dist - b.dist);

    if (dists.length > 0) {
      const bestEdge = dists[0].pos;
      
      // Don't immediately re-snap to the SAME edge we just undocked from
      // unless we've moved away and come back
      if (bestEdge === this.panelState.originalDockPosition) {
        // Only ignore if we are still very close to where we started
        // (This prevents the 'snap-back' effect when trying to undock)
        this.panelState.originalDockPosition = undefined;
        return;
      }

      this.setDockPosition(bestEdge);
    }

    this.panelState.originalDockPosition = undefined;
  }

  /**
   * Update the visual snap preview ghost area
   */
  private updateSnapPreview(mouseX: number, mouseY: number): void {
    if (!this.screen || !this.allowAutoDock) return;

    const threshold = 5;
    const sw = this.screen.width;
    const sh = this.screen.height;
    
    // Check Proximity
    const dists = [
      { pos: 'left' as DockPosition, dist: mouseX },
      { pos: 'right' as DockPosition, dist: sw - mouseX },
      { pos: 'top' as DockPosition, dist: mouseY },
      { pos: 'bottom' as DockPosition, dist: sh - mouseY }
    ].filter(d => d.dist <= threshold)
     .sort((a, b) => a.dist - b.dist);

    if (dists.length === 0 || dists[0].pos === this.panelState.originalDockPosition) {
      this.removeSnapPreview();
      return;
    }

    const edge = dists[0].pos;
    
    // Create or update ghost box
    if (!this.ghostBox) {
      this.ghostBox = new Box({
        parent: this.screen,
        border: { type: 'line', fg: 'cyan' },
        style: {
          fg: 'cyan',
          bg: 'cyan',
          transparent: true,  // Transparent background like blessed shadow demo
        },
        zIndex: 9999,
        ch: ' ', // Use simple space for fill
        tags: true,
      });
    }

    // Set preview dimensions based on edge
    let targetX = 0, targetY = 0, targetW = 0, targetH = 0;
    
    switch (edge) {
      case 'left':
        targetW = Math.floor(sw * 0.3);
        targetH = sh;
        break;
      case 'right':
        targetX = sw - Math.floor(sw * 0.3);
        targetW = Math.floor(sw * 0.3);
        targetH = sh;
        break;
      case 'top':
        targetW = sw;
        targetH = Math.floor(sh * 0.3);
        break;
      case 'bottom':
        targetY = sh - Math.floor(sh * 0.3);
        targetW = sw;
        targetH = Math.floor(sh * 0.3);
        break;
    }

    this.ghostBox!.aleft = targetX;
    this.ghostBox!.atop = targetY;
    this.ghostBox!.width = targetW;
    this.ghostBox!.height = targetH;
    
    // Explicitly trigger overlay update for transparency in web client
    if ((this.ghostBox as any)._emitOverlayEvent) {
      (this.ghostBox as any)._emitOverlayEvent(true);
    }

    this.ghostBox!.show();
    this.ghostBox!.setFront();
  }

  /**
   * Remove snap preview ghost
   */
  private removeSnapPreview(): void {
    if (this.ghostBox) {
      if ((this.ghostBox as any)._emitOverlayEvent) {
        (this.ghostBox as any)._emitOverlayEvent(false);
      }
      this.ghostBox.hide();
      if (this.screen) this.screen.render();
    }
  }

  /**
   * Check if this panel should swap positions with another docked panel
   * Returns true if a swap occurred
   */
  private checkPanelSwap(): boolean {
    if (!this.screen) return false;

    const myX = this.aleft;
    const myY = this.atop;
    const myW = this.width;
    const myH = this.height;
    const myCenterX = myX + myW / 2;
    const myCenterY = myY + myH / 2;

    // Find other docked panels
    for (const child of this.screen.children) {
      if (!(child instanceof DockablePanel) || child === this) continue;

      const otherPanel = child as DockablePanel;
      const otherPos = otherPanel.getDockPosition();

      // Only swap with docked panels (not floating)
      if (otherPos === 'float') continue;

      const otherX = otherPanel.aleft;
      const otherY = otherPanel.atop;
      const otherW = otherPanel.width;
      const otherH = otherPanel.height;

      // Check if our center point is over the other panel
      if (myCenterX >= otherX && myCenterX <= otherX + otherW &&
          myCenterY >= otherY && myCenterY <= otherY + otherH) {

        // If we came from a dock, swap them
        const myOriginalPosition = this.panelState.originalDockPosition || 'float';
        
        // Swap the dock positions
        if (myOriginalPosition !== 'float') {
          otherPanel.setDockPosition(myOriginalPosition);
        } else {
          otherPanel.setDockPosition('float'); // Bump it to floating
        }
        
        this.setDockPosition(otherPos);
        return true;
      }
    }

    return false;
  }

  /**
   * Merge another panel into this one as a tab
   */
  public mergeWith(other: DockablePanel): void {
    if (other === this || this.tabs.includes(other)) return;

    // If this is the first merge, add ourselves as the first tab
    if (this.tabs.length === 0) {
      this.tabs.push(this);
    }

    // Add the other panel
    this.tabs.push(other);
    
    // Setup the other panel to be a child of our container
    other.detach();
    other.parent = this;
    // Remove border and title from child panel as it's now a tab
    other.border = null;
    if (other.options) other.options.border = undefined;
    
    // Position to fill our content area
    other.position = { left: 0, top: 1, width: '100%', height: '100%-1' } as any;
    other.hide();
    
    // Force coordinate recalculation for the entire merged tree
    other._invalidateCoords();

    this.updateTabs();
    this.emit('merge', other);
  }

  /**
   * Update the tab bar display
   */
  private updateTabs(): void {
    if (this.tabs.length <= 1) return;

    // Clear existing tab buttons
    for (const btn of this.tabButtons) {
      btn.destroy();
    }
    this.tabButtons = [];

    let currentX = 1;

    this.tabs.forEach((panel, index) => {
      const label = panel.options.label || (panel.options as any).title || `Tab ${index + 1}`;
      const isActive = index === this.activeTab;

      const btn = new Button({
        parent: this,
        top: 0,
        left: currentX,
        width: String(label).length + 2,
        height: 1,
        content: isActive ? `{white-bg}{black-fg}${label}{/}` : label,
        tags: true,
        style: {
          bg: isActive ? 'white' : 'blue',
          fg: isActive ? 'black' : 'white',
        },
      });

      btn.on('press', () => {
        this.switchTab(index);
      });

      this.tabButtons.push(btn);
      currentX += String(label).length + 3;
    });

    // Hide/show correct content
    this.tabs.forEach((panel, index) => {
      if (index === this.activeTab) {
        if (panel !== this) panel.show();
      } else {
        if (panel !== this) panel.hide();
      }
    });

    if (this.screen) this.screen.render();
  }

  /**
   * Switch to a specific tab
   */
  public switchTab(index: number): void {
    if (index < 0 || index >= this.tabs.length) return;
    this.activeTab = index;
    this.updateTabs();
    this.emit('tab-switch', index);
  }

  /**
   * Set dock position
   */
  setDockPosition(position: DockPosition): void {
    this.dockPosition = position;
    this.panelState.position = position;
    this.applyDockPosition(position);
    this.emit('dock', position);
  }

  /**
   * Set dock position while preserving the panel's current width/height
   * Used by auto-docking to avoid dramatic layout changes
   */
  private setDockPositionPreservingSize(position: DockPosition, preserveWidth: number, preserveHeight: number): void {
    this.dockPosition = position;
    this.panelState.position = position;
    this.applyDockPositionPreservingSize(position, preserveWidth, preserveHeight);
    this.emit('dock', position);
  }

  /**
   * Apply dock position
   * Uses position.* for runtime updates (not options.* which is only read at construction)
   */
  private applyDockPosition(position: DockPosition): void {
    if (!this.screen) return;

    // Calculate available height considering constraints
    const top = this.topConstraint;
    const height = Math.max(5, this.screen.height - this.topConstraint - this.bottomConstraint);

    switch (position) {
      case 'top':
        this.position.left = 0;
        this.position.top = 0;
        this.position.width = this.screen.width;
        this.position.height = Math.floor(this.screen.height * 0.3);
        break;
      case 'bottom':
        this.position.left = 0;
        this.position.top = Math.floor(this.screen.height * 0.7);
        this.position.width = this.screen.width;
        this.position.height = Math.floor(this.screen.height * 0.3);
        break;
      case 'left':
        this.position.left = 0;
        this.position.top = top;
        // Respect current/configured width if available, otherwise default to 30%
        this.position.width = this.panelState.width || Math.floor(this.screen.width * 0.3);
        this.position.height = height;
        break;
      case 'right':
        // Respect current/configured width
        const w = this.panelState.width || Math.floor(this.screen.width * 0.3);
        this.position.left = this.screen.width - w;
        this.position.width = w;
        this.position.top = top;
        this.position.height = height;
        break;
      case 'center':
        this.position.left = Math.floor(this.screen.width * 0.25);
        this.position.top = Math.floor(this.screen.height * 0.25);
        this.position.width = Math.floor(this.screen.width * 0.5);
        this.position.height = Math.floor(this.screen.height * 0.5);
        break;
      case 'float':
        // Restore saved position or use defaults
        this.position.left = this.panelState.savedX || this.panelState.x;
        this.position.top = this.panelState.savedY || this.panelState.y;
        this.position.width = this.panelState.savedWidth || this.panelState.width;
        this.position.height = this.panelState.savedHeight || this.panelState.height;
        break;
    }

    // Sanitize dimensions
    if (typeof this.position.width === 'number') this.position.width = Math.max(1, this.position.width);
    if (typeof this.position.height === 'number') this.position.height = Math.max(1, this.position.height);
    if (typeof this.position.left === 'number' && isNaN(this.position.left)) this.position.left = 0;
    if (typeof this.position.top === 'number' && isNaN(this.position.top)) this.position.top = 0;

    // Invalidate coordinate cache for all children so they recalculate positions
    this._invalidateCoords();

    if (this.screen) {
      this.screen.render();
    }
  }

  /**
   * Apply dock position while preserving panel dimensions
   * Used by auto-docking to snap to edge without changing size dramatically
   */
  private applyDockPositionPreservingSize(position: DockPosition, preserveWidth: number, preserveHeight: number): void {
    if (!this.screen) return;

    // Constrain preserved dimensions to screen bounds
    const width = Math.min(preserveWidth, this.screen.width);
    const height = Math.min(preserveHeight, this.screen.height);

    switch (position) {
      case 'top':
        this.position.left = 0;
        this.position.top = 0;
        this.position.width = width;
        this.position.height = height;
        break;
      case 'bottom':
        this.position.left = 0;
        this.position.top = this.screen.height - height;
        this.position.width = width;
        this.position.height = height;
        break;
      case 'left':
        this.position.left = 0;
        this.position.top = 0;
        this.position.width = width;
        this.position.height = height;
        break;
      case 'right':
        this.position.left = this.screen.width - width;
        this.position.top = 0;
        this.position.width = width;
        this.position.height = height;
        break;
      case 'center':
        this.position.left = Math.floor((this.screen.width - width) / 2);
        this.position.top = Math.floor((this.screen.height - height) / 2);
        this.position.width = width;
        this.position.height = height;
        break;
      case 'float':
        // Restore saved position or use defaults
        this.position.left = this.panelState.savedX || this.panelState.x;
        this.position.top = this.panelState.savedY || this.panelState.y;
        this.position.width = this.panelState.savedWidth || this.panelState.width;
        this.position.height = this.panelState.savedHeight || this.panelState.height;
        break;
    }

    // Update panel state with new dimensions
    this.panelState.width = this.position.width as number;
    this.panelState.height = this.position.height as number;
    this.panelState.x = this.position.left as number;
    this.panelState.y = this.position.top as number;

    // Invalidate coordinate cache for all children so they recalculate positions
    this._invalidateCoords();

    if (this.screen) {
      this.screen.render();
    }
  }

  /**
   * Minimize panel
   * Uses position.* for runtime updates (not options.* which is only read at construction)
   */
  minimize(): void {
    if (this.panelState.minimized) return;

    // Save current state
    this.panelState.savedWidth = this.width as number;
    this.panelState.savedHeight = this.height as number;
    this.panelState.savedX = this.left as number;
    this.panelState.savedY = this.top as number;

    // Hide all children
    for (const child of this.children) {
      if (child !== this.titleBar && child !== this.minimizeButton && child !== this.closeButton) {
        child.hide();
      }
    }

    // Resize to title bar only
    this.position.height = 1;
    this.panelState.minimized = true;

    // Create minimized bar at bottom if not docked
    if (this.dockPosition === 'float' && this.screen) {
      this.position.top = this.screen.height - 1;
      this.position.width = Math.min(this.panelState.savedWidth!, 30);
    }

    // Invalidate coordinate cache for all children
    this._invalidateCoords();

    if (this.screen) {
      this.screen.render();
    }

    this.emit('minimize');
  }

  /**
   * Maximize/restore panel
   * Uses position.* for runtime updates (not options.* which is only read at construction)
   */
  maximize(): void {
    if (!this.panelState.minimized) return;

    // Show all children
    for (const child of this.children) {
      child.show();
    }

    // Restore size and position
    this.position.width = this.panelState.savedWidth || this.panelState.width;
    this.position.height = this.panelState.savedHeight || this.panelState.height;
    this.position.left = this.panelState.savedX || this.panelState.x;
    this.position.top = this.panelState.savedY || this.panelState.y;

    this.panelState.minimized = false;

    // Invalidate coordinate cache for all children
    this._invalidateCoords();

    if (this.screen) {
      this.screen.render();
    }

    this.emit('maximize');
  }

  /**
   * Toggle minimize/maximize
   */
  toggleMinimize(): void {
    if (this.panelState.minimized) {
      this.maximize();
    } else {
      this.minimize();
    }
  }

  /**
   * Toggle fullscreen maximization
   */
  public toggleMaximize(): void {
    if (this.preMaximizeState) {
      // Restore from maximized
      this.setState(this.preMaximizeState);
      this.preMaximizeState = null;
    } else {
      // Save current state
      this.preMaximizeState = this.getState();
      
      // Expand to fill screen (respect topConstraint)
      if (this.screen) {
        this.setState({
          x: 0,
          y: this.topConstraint,
          width: this.screen.width,
          height: this.screen.height - this.topConstraint,
          position: 'float'
        });
        this.bringToFront();
      }
    }
  }

  /**
   * Check if panel is currently maximized to fullscreen
   */
  public isMaximized(): boolean {
    return this.preMaximizeState !== null;
  }

  /**
   * Bring panel to front
   */
  bringToFront(): void {
    if (!this.screen) return;

    // Find max z-index among all panels
    let maxZ = 100;
    for (const child of this.screen.children) {
      if (child instanceof DockablePanel && child !== this) {
        maxZ = Math.max(maxZ, (child as any).panelState.zIndex);
      }
    }

    this.panelState.zIndex = maxZ + 1;
    // Note: blessed doesn't have built-in z-index, but we track it for ordering
    this.detach();
    this.screen.append(this);
  }

  /**
   * Get panel state
   */
  getState(): PanelState {
    return { ...this.panelState };
  }

  /**
   * Restore panel state
   * Uses position.* for runtime updates (not options.* which is only read at construction)
   */
  async setState(state: Partial<PanelState>): Promise<void> {
    if (state.position) {
      this.setDockPosition(state.position);
    }

    if (this.screen) {
      const sw = this.screen.width;
      const sh = this.screen.height;

      if (state.width !== undefined) {
        const newWidth = Math.max(5, Math.min(state.width, sw));
        this.position.width = newWidth;
        this.panelState.width = newWidth;
      }
      
      if (state.height !== undefined) {
        const newHeight = Math.max(3, Math.min(state.height, sh));
        this.position.height = newHeight;
        this.panelState.height = newHeight;
      }

      if (state.x !== undefined) {
        const pw = (this.position.width as number) || 40;
        const newLeft = Math.max(0, Math.min(state.x, sw - pw));
        this.position.left = newLeft;
        this.panelState.x = newLeft;
      }
      
      if (state.y !== undefined) {
        const ph = (this.position.height as number) || 20;
        const newTop = Math.max(this.topConstraint, Math.min(state.y, sh - ph));
        this.position.top = newTop;
        this.panelState.y = newTop;
      }
    } else {
      // Fallback if screen not available yet
      if (state.x !== undefined) { this.position.left = state.x; this.panelState.x = state.x; }
      if (state.y !== undefined) { this.position.top = state.y; this.panelState.y = state.y; }
      if (state.width !== undefined) { this.position.width = state.width; this.panelState.width = state.width; }
      if (state.height !== undefined) { this.position.height = state.height; this.panelState.height = state.height; }
    }

    if (state.minimized !== undefined) {
      if (state.minimized) {
        this.minimize();
      } else {
        this.maximize();
      }
    }

    // Invalidate coordinate cache for all children
    this._invalidateCoords();

    if (this.screen) {
      this.screen.render();
    }
  }

  /**
   * Check if panel is minimized
   */
  isMinimized(): boolean {
    return this.panelState.minimized;
  }

  /**
   * Get dock position
   */
  getDockPosition(): DockPosition {
    return this.dockPosition;
  }

  /**
   * Save panel state to persistent storage
   */
  public async saveState(): Promise<void> {
    if (!this.persistenceKey || !this.screen?.storage) return;
    const state = this.getState();
    await this.screen.storage.set(`layout:${this.persistenceKey}`, state);
  }

  /**
   * Load panel state from persistent storage
   */
  public async loadState(): Promise<void> {
    if (!this.persistenceKey || !this.screen?.storage) return;
    const saved = await this.screen.storage.get(`layout:${this.persistenceKey}`);
    if (saved) {
      await this.setState(saved);
    }
  }

  /**
   * Calculate the content width/height needed to fit all children
   * Returns { width, height } representing the minimum dimensions needed
   */
  private calculateContentSize(): { width: number; height: number } {
    let maxContentWidth = 0;
    let totalContentHeight = 0;

    // Helper to strip ANSI codes and blessed tags for accurate width calculation
    const stripFormatting = (str: string): string => {
      // Strip ANSI escape codes
      let clean = str.replace(/\x1b\[[0-9;]*m/g, '');
      // Strip blessed tags like {red-fg}, {/red-fg}, {bold}, etc.
      clean = clean.replace(/\{[^}]+\}/g, '');
      return clean;
    };

    // Calculate based on direct children's content
    for (const child of this.children) {
      // Skip UI elements (title bar, buttons)
      if (child === this.titleBar || child === this.minimizeButton || child === this.closeButton) {
        continue;
      }

      const childContent = (child as any).content || '';
      const lines = childContent.split('\n');

      for (const line of lines) {
        const cleanLine = stripFormatting(line);
        maxContentWidth = Math.max(maxContentWidth, cleanLine.length);
      }

      totalContentHeight += lines.length;

      // Also check child's _lines if available (parsed content)
      if ((child as any)._lines && Array.isArray((child as any)._lines)) {
        for (const line of (child as any)._lines) {
          const cleanLine = stripFormatting(String(line));
          maxContentWidth = Math.max(maxContentWidth, cleanLine.length);
        }
        totalContentHeight = Math.max(totalContentHeight, (child as any)._lines.length);
      }
    }

    // Add space for borders (2) and padding
    const borderWidth = this.border ? 2 : 0;
    const borderHeight = this.border ? 2 : 0;
    const titleBarHeight = this.titleBar ? 1 : 0;

    return {
      width: maxContentWidth + borderWidth,
      height: totalContentHeight + borderHeight + titleBarHeight,
    };
  }

  /**
   * Resize panel to fit its content (grow only, never shrink)
   * Only expands when content doesn't fit, never shrinks below current size
   * Respects minWidth/minHeight/maxWidth/maxHeight constraints
   */
  public fitToContent(): void {
    if (!this.fitContentSettings.width && !this.fitContentSettings.height) {
      return; // fitContent disabled
    }

    const { width: contentWidth, height: contentHeight } = this.calculateContentSize();

    let newWidth = this.width as number;
    let newHeight = this.height as number;

    // Apply width fit if enabled - GROW ONLY (never shrink)
    if (this.fitContentSettings.width) {
      // Only grow if content is wider than current width
      if (contentWidth > newWidth) {
        newWidth = contentWidth;
      }
      // Apply max constraint
      if (this.maxWidth) newWidth = Math.min(newWidth, this.maxWidth);
      // Constrain to screen
      if (this.screen) {
        newWidth = Math.min(newWidth, this.screen.width);
      }
    }

    // Apply height fit if enabled - GROW ONLY (never shrink)
    if (this.fitContentSettings.height) {
      // Only grow if content is taller than current height
      if (contentHeight > newHeight) {
        newHeight = contentHeight;
      }
      // Apply max constraint
      if (this.maxHeight) newHeight = Math.min(newHeight, this.maxHeight);
      // Constrain to screen
      if (this.screen) {
        const maxScreenHeight = this.screen.height - this.topConstraint - this.bottomConstraint;
        newHeight = Math.min(newHeight, maxScreenHeight);
      }
    }

    // Only update if dimensions changed
    if (newWidth !== this.width || newHeight !== this.height) {
      this.position.width = newWidth;
      this.position.height = newHeight;
      this.panelState.width = newWidth;
      this.panelState.height = newHeight;

      // If docked right, adjust left position to maintain right edge
      if (this.dockPosition === 'right' && this.screen) {
        this.position.left = this.screen.width - newWidth;
        this.panelState.x = this.position.left as number;
      }

      this._invalidateCoords();

      if (this.screen) {
        this.screen.render();
      }

      this.emit('fit-content', { width: newWidth, height: newHeight });
    }
  }

  /**
   * Enable or disable fitContent mode
   */
  public setFitContent(enabled: boolean | { width?: boolean; height?: boolean }): void {
    if (enabled === false) {
      this.fitContentSettings = { width: false, height: false };
    } else if (typeof enabled === 'object') {
      this.fitContentSettings = {
        width: enabled.width !== false,
        height: enabled.height !== false,
      };
    } else {
      this.fitContentSettings = { width: true, height: true };
    }
  }

  /**
   * Get current fitContent settings
   */
  public getFitContent(): { width: boolean; height: boolean } {
    return { ...this.fitContentSettings };
  }
}
