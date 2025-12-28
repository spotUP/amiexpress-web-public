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
import type { Element } from '../core/element';
import type { Screen } from '../core/screen';

export type DockPosition = 'top' | 'bottom' | 'left' | 'right' | 'center' | 'float';

export interface DockablePanelOptions extends PanelOptions {
  dockPosition?: DockPosition;
  allowFloat?: boolean;
  allowResize?: boolean;
  allowMinimize?: boolean;
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
  private minimizeButton?: Element;
  private closeButton?: Element;
  private titleBar?: Element;
  private resizeHandles: Map<string, Element> = new Map();
  private minimizedBar?: Element;
  private minWidth?: number;
  private maxWidth?: number;
  private minHeight?: number;
  private maxHeight?: number;
  private resizable: boolean;
  private currentResizeEdge: string | null = null;

  private screenListenersBound: boolean = false;

  constructor(options: DockablePanelOptions = {}) {
    super({
      ...options,
      draggable: options.draggable !== false,
      mouse: true,
      keys: true,
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

    this.setupTitleBar(options);
    this.setupDocking();
    this.setupDragging();
    this.setupResizing();

    if (this.panelState.minimized) {
      this.minimize();
    }

    // Defer screen event binding until element is attached to a screen
    // The screen may not be available at construction time
    this.on('attach', () => {
      this.bindScreenEvents();
    });

    // Also try to bind immediately if screen is already available
    if (this.screen) {
      this.bindScreenEvents();
    }
  }

  /**
   * Override append to ensure UI elements (title bar, resize handles) stay on top
   * When user content is added as children, we need to reorder so our UI is rendered last
   */
  append(element: Element): void {
    super.append(element);
    this.bringUIToFront();
  }

  /**
   * Bring title bar and resize handles to front (rendered last = on top)
   */
  private bringUIToFront(): void {
    // Collect UI elements to move to front
    const uiElements: Element[] = [];

    // Collect resize handles
    for (const handle of this.resizeHandles.values()) {
      uiElements.push(handle);
    }

    // Title bar and its buttons should be on top
    if (this.titleBar) {
      uiElements.push(this.titleBar);
    }

    // Move each UI element to the end of children array (rendered last)
    for (const elem of uiElements) {
      const idx = this.children.indexOf(elem);
      if (idx !== -1 && idx !== this.children.length - 1) {
        this.children.splice(idx, 1);
        this.children.push(elem);
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
      if (this.dockPosition !== 'float') {
        // Re-apply dock position to recalculate dimensions
        this.applyDockPosition(this.dockPosition);
      } else {
        // For floating panels, ensure they stay within screen bounds
        this.constrainToScreen();
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

    // Ensure panel doesn't extend beyond screen bounds
    let newLeft = Math.max(0, Math.min(currentLeft, this.screen.width - currentWidth));
    let newTop = Math.max(0, Math.min(currentTop, this.screen.height - currentHeight));

    // If panel is larger than screen, resize it
    let newWidth = Math.min(currentWidth, this.screen.width);
    let newHeight = Math.min(currentHeight, this.screen.height);

    // Apply min constraints
    if (this.minWidth) newWidth = Math.max(newWidth, this.minWidth);
    if (this.minHeight) newHeight = Math.max(newHeight, this.minHeight);

    this.position.left = newLeft;
    this.position.top = newTop;
    this.position.width = newWidth;
    this.position.height = newHeight;
  }

  /**
   * Setup title bar with minimize/close buttons
   */
  private setupTitleBar(options: DockablePanelOptions): void {
    if (!options.label && !options.showMinimizeButton && !options.showCloseButton) {
      return;
    }

    // Create title bar
    const Box = require('./box').Box;
    this.titleBar = new Box({
      parent: this,
      top: 0,
      left: 0,
      width: '100%',
      height: 1,
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
      const Button = require('./button').Button;
      this.minimizeButton = new Button({
        parent: this.titleBar,
        right: (options.showCloseButton !== false ? 4 : 1),
        top: 0,
        width: 3,
        height: 1,
        content: '_',
        style: {
          fg: 'white',
          bg: 'blue',
          focus: {
            bg: 'cyan',
          },
        },
      });

      this.minimizeButton!.on('press', () => {
        this.toggleMinimize();
      });
    }

    // Add close button
    if (options.showCloseButton) {
      const Button = require('./button').Button;
      this.closeButton = new Button({
        parent: this.titleBar,
        right: 1,
        top: 0,
        width: 3,
        height: 1,
        content: 'X',
        style: {
          fg: 'white',
          bg: 'red',
          focus: {
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
    if (this.dockPosition !== 'float') {
      this.applyDockPosition(this.dockPosition);
    }
  }

  /**
   * Setup dragging behavior
   * Note: Screen-level mousemove/mouseup handlers are set up in bindScreenEvents()
   */
  private setupDragging(): void {
    this.on('mousedown', (data: any) => {
      // Don't start drag if clicking on a resize handle
      // Check if the event originated from a resize handle by checking all handles
      for (const handle of this.resizeHandles.values()) {
        if (data.target === handle) {
          return; // Let the resize handle process this event
        }
      }

      // Only start drag from title bar or if no title bar exists
      if (!this.titleBar || data.y === 0) {
        this.startDrag(data.x, data.y);
      }
    });
  }

  /**
   * Setup resizing behavior on all edges and corners
   */
  private setupResizing(): void {
    if (!this.resizable) return;

    const Box = require('./box').Box;

    // Create resize handles for all 8 positions (4 corners + 4 edges)
    // Larger hit areas for better usability
    const handles = [
      // Corners (3x2 for easier clicking)
      { name: 'nw', left: 0, top: 0, width: 3, height: 2, content: '┌', cursor: 'nw' },
      { name: 'ne', right: 0, top: 0, width: 3, height: 2, content: '┐', cursor: 'ne' },
      { name: 'sw', left: 0, bottom: 0, width: 3, height: 2, content: '└', cursor: 'sw' },
      { name: 'se', right: 0, bottom: 0, width: 3, height: 2, content: '┘', cursor: 'se' },
      // Edges (visible with border characters for better clickability)
      { name: 'n', left: 3, top: 0, right: 3, height: 1, content: '─', cursor: 'n' },
      { name: 's', left: 3, bottom: 0, right: 3, height: 1, content: '─', cursor: 's' },
      { name: 'w', left: 0, top: 2, bottom: 2, width: 1, content: '│', cursor: 'w' },
      { name: 'e', right: 0, top: 2, bottom: 2, width: 1, content: '│', cursor: 'e' },
    ];

    for (const handleConfig of handles) {
      const handle = new Box({
        parent: this,
        left: handleConfig.left,
        top: handleConfig.top,
        right: handleConfig.right,
        bottom: handleConfig.bottom,
        width: handleConfig.width,
        height: handleConfig.height,
        content: handleConfig.content,
        style: {
          fg: 'cyan',
          bg: 'black',
          hover: {
            fg: 'yellow',
            bg: 'blue',
            bold: true,
          },
        },
        mouse: true,
      });

      // Store handle
      this.resizeHandles.set(handleConfig.name, handle);

      // Mousedown starts resize
      handle.on('mousedown', (data: any) => {
        this.startResizeFromEdge(handleConfig.name, data.x, data.y);
      });

      // Hover effect - manually change colors (blessed doesn't auto-apply style.hover)
      handle.on('mouseover', () => {
        // Apply hover style
        handle.style.fg = 'yellow';
        handle.style.bg = 'blue';
        this.showResizeCursor(handleConfig.name);

        // Force render to show color change
        if (this.screen) {
          this.screen.render();
        }
      });

      handle.on('mouseout', () => {
        // Restore normal style
        handle.style.fg = 'cyan';
        handle.style.bg = 'black';
        this.hideResizeCursor();

        // Force render to show color change
        if (this.screen) {
          this.screen.render();
        }
      });
    }
    // Note: Screen-level mousemove/mouseup handlers are set up in bindScreenEvents()
  }

  /**
   * Show visual resize cursor
   */
  private showResizeCursor(edge: string): void {
    const handle = this.resizeHandles.get(edge);
    if (!handle) return;

    // Update handle appearance to show it's hoverable
    const cursorChars: Record<string, string> = {
      nw: '↖',
      ne: '↗',
      sw: '↙',
      se: '↘',
      n: '↑',
      s: '↓',
      w: '←',
      e: '→',
    };

    handle.setContent(cursorChars[edge] || '');
    if (this.screen) {
      this.screen.render();
    }
  }

  /**
   * Hide visual resize cursor
   */
  private hideResizeCursor(): void {
    // Restore original content
    const cursorChars: Record<string, string> = {
      nw: '┌',
      ne: '┐',
      sw: '└',
      se: '┘',
      n: '─',
      s: '─',
      w: '│',
      e: '│',
    };

    for (const [edge, handle] of this.resizeHandles) {
      handle.setContent(cursorChars[edge] || '');
    }

    if (this.screen) {
      this.screen.render();
    }
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

    // Visual feedback: Change border color during drag
    const panel = this as any;
    if (panel.style && panel.style.border) {
      panel.style.border.fg = 'yellow';
    }
    if (this.titleBar) {
      (this.titleBar as any).style.bg = 'cyan';
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

    // Constrain to screen bounds
    if (this.screen) {
      newLeft = Math.max(0, Math.min(newLeft, this.screen.width - (this.width as number)));
      newTop = Math.max(0, Math.min(newTop, this.screen.height - (this.height as number)));
    }

    // Use position.* for runtime updates (not options.* which is only read at construction)
    this.position.left = newLeft;
    this.position.top = newTop;
    this.panelState.x = newLeft;
    this.panelState.y = newTop;

    if (this.screen) {
      this.screen.render();
    }

    this.emit('drag', { x: this.left, y: this.top });
  }

  /**
   * Stop dragging
   */
  private stopDrag(): void {
    this.isDragging = false;

    // Restore border color
    const panel = this as any;
    if (panel.style && panel.style.border) {
      const borderOptions = this.options.border as any;
      panel.style.border.fg = borderOptions?.fg || 'green';
    }
    if (this.titleBar) {
      (this.titleBar as any).style.bg = 'blue';
    }

    // Check for edge docking
    this.checkEdgeDocking();

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

    // Visual feedback: Change border color during resize
    const panel = this as any;
    if (panel.style && panel.style.border) {
      panel.style.border.fg = 'yellow';
    }
    if (this.titleBar) {
      (this.titleBar as any).style.bg = 'cyan';
    }

    this.emit('resize-start');
  }

  /**
   * Handle resizing from a specific edge
   */
  private handleResizeFromEdge(edge: string, x: number, y: number): void {
    const deltaX = x - this.dragStartX;
    const deltaY = y - this.dragStartY;

    let newWidth = this.width as number;
    let newHeight = this.height as number;
    let newLeft = this.dragStartLeft;
    let newTop = this.dragStartTop;

    // Calculate new dimensions based on which edge is being dragged
    switch (edge) {
      case 'nw': // North-West corner
        newWidth -= deltaX;
        newHeight -= deltaY;
        newLeft = this.dragStartLeft + deltaX;
        newTop = this.dragStartTop + deltaY;
        break;
      case 'ne': // North-East corner
        newWidth += deltaX;
        newHeight -= deltaY;
        newTop = this.dragStartTop + deltaY;
        break;
      case 'sw': // South-West corner
        newWidth -= deltaX;
        newHeight += deltaY;
        newLeft = this.dragStartLeft + deltaX;
        break;
      case 'se': // South-East corner
        newWidth += deltaX;
        newHeight += deltaY;
        break;
      case 'n': // North edge
        newHeight -= deltaY;
        newTop = this.dragStartTop + deltaY;
        break;
      case 's': // South edge
        newHeight += deltaY;
        break;
      case 'w': // West edge
        newWidth -= deltaX;
        newLeft = this.dragStartLeft + deltaX;
        break;
      case 'e': // East edge
        newWidth += deltaX;
        break;
    }

    // Apply min/max constraints
    if (this.minWidth) {
      if (newWidth < this.minWidth) {
        // Prevent shrinking below minimum
        if (edge.includes('w')) {
          newLeft = this.dragStartLeft + ((this.width as number) - this.minWidth);
        }
        newWidth = this.minWidth;
      }
    }
    if (this.maxWidth) {
      if (newWidth > this.maxWidth) {
        if (edge.includes('w')) {
          newLeft = this.dragStartLeft + ((this.width as number) - this.maxWidth);
        }
        newWidth = this.maxWidth;
      }
    }
    if (this.minHeight) {
      if (newHeight < this.minHeight) {
        if (edge.includes('n')) {
          newTop = this.dragStartTop + ((this.height as number) - this.minHeight);
        }
        newHeight = this.minHeight;
      }
    }
    if (this.maxHeight) {
      if (newHeight > this.maxHeight) {
        if (edge.includes('n')) {
          newTop = this.dragStartTop + ((this.height as number) - this.maxHeight);
        }
        newHeight = this.maxHeight;
      }
    }

    // Use position.* for runtime updates (not options.* which is only read at construction)
    this.position.width = newWidth;
    this.position.height = newHeight;
    this.position.left = newLeft;
    this.position.top = newTop;

    this.panelState.width = newWidth;
    this.panelState.height = newHeight;
    this.panelState.x = newLeft;
    this.panelState.y = newTop;

    if (this.screen) {
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

    // Restore border color
    const panel = this as any;
    if (panel.style && panel.style.border) {
      const borderOptions = this.options.border as any;
      panel.style.border.fg = borderOptions?.fg || 'green';
    }
    if (this.titleBar) {
      (this.titleBar as any).style.bg = 'blue';
    }

    this.hideResizeCursor();

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

    const threshold = 30;  // pixels from edge to trigger docking (increased for easier snapping)
    const x = this.left as number;
    const y = this.top as number;
    const w = this.width as number;
    const h = this.height as number;

    // First check if we're overlapping with another docked panel and should swap
    const swapped = this.checkPanelSwap();
    if (swapped) return;

    // Check edges for docking
    if (x < threshold) {
      this.setDockPosition('left');
    } else if (x + w > this.screen.width - threshold) {
      this.setDockPosition('right');
    } else if (y < threshold) {
      this.setDockPosition('top');
    } else if (y + h > this.screen.height - threshold) {
      this.setDockPosition('bottom');
    }
  }

  /**
   * Check if this panel should swap positions with another docked panel
   * Returns true if a swap occurred
   */
  private checkPanelSwap(): boolean {
    if (!this.screen) return false;

    // Can only swap if we had an original dock position (were docked before dragging)
    if (!this.panelState.originalDockPosition) return false;

    const myX = this.left as number;
    const myY = this.top as number;
    const myW = this.width as number;
    const myH = this.height as number;
    const myCenterX = myX + myW / 2;
    const myCenterY = myY + myH / 2;

    // Find other docked panels
    for (const child of this.screen.children) {
      if (!(child instanceof DockablePanel) || child === this) continue;

      const otherPanel = child as DockablePanel;
      const otherPos = otherPanel.getDockPosition();

      // Only swap with docked panels (not floating)
      if (otherPos === 'float') continue;

      const otherX = (otherPanel.left as number) || 0;
      const otherY = (otherPanel.top as number) || 0;
      const otherW = (otherPanel.width as number) || 0;
      const otherH = (otherPanel.height as number) || 0;

      // Check if our center point is over the other panel
      if (myCenterX >= otherX && myCenterX <= otherX + otherW &&
          myCenterY >= otherY && myCenterY <= otherY + otherH) {

        // Swap positions using the original position we saved before dragging
        const myOriginalPosition = this.panelState.originalDockPosition;
        const otherPosition = otherPanel.getDockPosition();

        // Swap the dock positions
        this.setDockPosition(otherPosition);
        otherPanel.setDockPosition(myOriginalPosition);

        // Clear the saved original position after successful swap
        this.panelState.originalDockPosition = undefined;

        return true;
      }
    }

    return false;
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
   * Apply dock position
   * Uses position.* for runtime updates (not options.* which is only read at construction)
   */
  private applyDockPosition(position: DockPosition): void {
    if (!this.screen) return;

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
        this.position.top = 0;
        this.position.width = Math.floor(this.screen.width * 0.3);
        this.position.height = this.screen.height;
        break;
      case 'right':
        this.position.left = Math.floor(this.screen.width * 0.7);
        this.position.top = 0;
        this.position.width = Math.floor(this.screen.width * 0.3);
        this.position.height = this.screen.height;
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
  setState(state: Partial<PanelState>): void {
    if (state.position) {
      this.setDockPosition(state.position);
    }
    if (state.x !== undefined) {
      this.position.left = state.x;
      this.panelState.x = state.x;
    }
    if (state.y !== undefined) {
      this.position.top = state.y;
      this.panelState.y = state.y;
    }
    if (state.width !== undefined) {
      this.position.width = state.width;
      this.panelState.width = state.width;
    }
    if (state.height !== undefined) {
      this.position.height = state.height;
      this.panelState.height = state.height;
    }
    if (state.minimized !== undefined) {
      if (state.minimized) {
        this.minimize();
      } else {
        this.maximize();
      }
    }

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
}
