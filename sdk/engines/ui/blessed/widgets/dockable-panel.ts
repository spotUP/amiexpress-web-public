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

    // Make title bar draggable
    if (options.draggable !== false && this.titleBar) {
      this.titleBar.on('mousedown', (data: any) => {
        this.startDrag(data.x, data.y);
      });
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
          fg: 'black',
          bg: 'yellow',
          focus: {
            bg: 'green',
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
   */
  private setupDragging(): void {
    this.on('mousedown', (data: any) => {
      // Only start drag from title bar or if no title bar exists
      if (!this.titleBar || data.y === 0) {
        this.startDrag(data.x, data.y);
      }
    });

    if (this.screen) {
      this.screen.on('mousemove', (data: any) => {
        if (this.isDragging) {
          this.handleDrag(data.x, data.y);
        }
      });

      this.screen.on('mouseup', () => {
        if (this.isDragging) {
          this.stopDrag();
        }
      });
    }
  }

  /**
   * Setup resizing behavior on all edges and corners
   */
  private setupResizing(): void {
    if (!this.resizable) return;

    const Box = require('./box').Box;

    // Create resize handles for all 8 positions (4 corners + 4 edges)
    const handles = [
      // Corners
      { name: 'nw', left: 0, top: 0, width: 2, height: 1, content: '┌', cursor: 'nw' },
      { name: 'ne', right: 0, top: 0, width: 2, height: 1, content: '┐', cursor: 'ne' },
      { name: 'sw', left: 0, bottom: 0, width: 2, height: 1, content: '└', cursor: 'sw' },
      { name: 'se', right: 0, bottom: 0, width: 2, height: 1, content: '┘', cursor: 'se' },
      // Edges
      { name: 'n', left: 2, top: 0, right: 2, height: 1, content: '', cursor: 'n' },
      { name: 's', left: 2, bottom: 0, right: 2, height: 1, content: '', cursor: 's' },
      { name: 'w', left: 0, top: 1, bottom: 1, width: 1, content: '', cursor: 'w' },
      { name: 'e', right: 0, top: 1, bottom: 1, width: 1, content: '', cursor: 'e' },
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

      // Hover effect
      handle.on('mouseover', () => {
        this.showResizeCursor(handleConfig.name);
      });

      handle.on('mouseout', () => {
        this.hideResizeCursor();
      });
    }

    // Global mouse handlers for dragging
    if (this.screen) {
      this.screen.on('mousemove', (data: any) => {
        if (this.isResizing && this.currentResizeEdge) {
          this.handleResizeFromEdge(this.currentResizeEdge, data.x, data.y);
        }
      });

      this.screen.on('mouseup', () => {
        if (this.isResizing) {
          this.stopResize();
        }
      });
    }
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
      n: '',
      s: '',
      w: '',
      e: '',
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

    // Bring to front
    this.bringToFront();

    // Undock if currently docked
    if (this.dockPosition !== 'float') {
      this.setDockPosition('float');
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

    this.options.left = newLeft;
    this.options.top = newTop;
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

    // Check for edge docking
    this.checkEdgeDocking();

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

    // Update dimensions
    this.options.width = newWidth;
    this.options.height = newHeight;
    this.options.left = newLeft;
    this.options.top = newTop;

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
    this.hideResizeCursor();
    this.emit('resize-end');
  }

  /**
   * Check if panel should dock to an edge
   */
  private checkEdgeDocking(): void {
    if (!this.screen) return;

    const threshold = 5;  // pixels from edge to trigger docking
    const x = this.left as number;
    const y = this.top as number;
    const w = this.width as number;
    const h = this.height as number;

    // Check edges
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
   */
  private applyDockPosition(position: DockPosition): void {
    if (!this.screen) return;

    switch (position) {
      case 'top':
        this.options.left = 0;
        this.options.top = 0;
        this.options.width = this.screen.width;
        this.options.height = Math.floor(this.screen.height * 0.3);
        break;
      case 'bottom':
        this.options.left = 0;
        this.options.top = Math.floor(this.screen.height * 0.7);
        this.options.width = this.screen.width;
        this.options.height = Math.floor(this.screen.height * 0.3);
        break;
      case 'left':
        this.options.left = 0;
        this.options.top = 0;
        this.options.width = Math.floor(this.screen.width * 0.3);
        this.options.height = this.screen.height;
        break;
      case 'right':
        this.options.left = Math.floor(this.screen.width * 0.7);
        this.options.top = 0;
        this.options.width = Math.floor(this.screen.width * 0.3);
        this.options.height = this.screen.height;
        break;
      case 'center':
        this.options.left = Math.floor(this.screen.width * 0.25);
        this.options.top = Math.floor(this.screen.height * 0.25);
        this.options.width = Math.floor(this.screen.width * 0.5);
        this.options.height = Math.floor(this.screen.height * 0.5);
        break;
      case 'float':
        // Restore saved position or use defaults
        this.options.left = this.panelState.savedX || this.panelState.x;
        this.options.top = this.panelState.savedY || this.panelState.y;
        this.options.width = this.panelState.savedWidth || this.panelState.width;
        this.options.height = this.panelState.savedHeight || this.panelState.height;
        break;
    }

    if (this.screen) {
      this.screen.render();
    }
  }

  /**
   * Minimize panel
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
    this.options.height = 1;
    this.panelState.minimized = true;

    // Create minimized bar at bottom if not docked
    if (this.dockPosition === 'float' && this.screen) {
      this.options.top = this.screen.height - 1;
      this.options.width = Math.min(this.panelState.savedWidth!, 30);
    }

    if (this.screen) {
      this.screen.render();
    }

    this.emit('minimize');
  }

  /**
   * Maximize/restore panel
   */
  maximize(): void {
    if (!this.panelState.minimized) return;

    // Show all children
    for (const child of this.children) {
      child.show();
    }

    // Restore size and position
    this.options.width = this.panelState.savedWidth || this.panelState.width;
    this.options.height = this.panelState.savedHeight || this.panelState.height;
    this.options.left = this.panelState.savedX || this.panelState.x;
    this.options.top = this.panelState.savedY || this.panelState.y;

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
   */
  setState(state: Partial<PanelState>): void {
    if (state.position) {
      this.setDockPosition(state.position);
    }
    if (state.x !== undefined) {
      this.options.left = state.x;
      this.panelState.x = state.x;
    }
    if (state.y !== undefined) {
      this.options.top = state.y;
      this.panelState.y = state.y;
    }
    if (state.width !== undefined) {
      this.options.width = state.width;
      this.panelState.width = state.width;
    }
    if (state.height !== undefined) {
      this.options.height = state.height;
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
