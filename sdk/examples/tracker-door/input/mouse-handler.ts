/**
 * Mouse Input Handler
 * Comprehensive mouse support for TrackerDoor interface
 */

export interface MouseEvent {
  type: 'click' | 'doubleclick' | 'drag' | 'wheel' | 'move';
  x: number;
  y: number;
  button: 'left' | 'right' | 'middle';
  shift: boolean;
  ctrl: boolean;
  alt: boolean;
  deltaY?: number; // For wheel events
}

export interface UIRegion {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  onClick?: (event: MouseEvent) => void;
  onDoubleClick?: (event: MouseEvent) => void;
  onDrag?: (event: MouseEvent, startX: number, startY: number) => void;
  onWheel?: (event: MouseEvent) => void;
  enabled: boolean;
}

export class MouseHandler {
  private regions: Map<string, UIRegion> = new Map();
  private lastClickTime: number = 0;
  private lastClickPos: { x: number; y: number } = { x: 0, y: 0 };
  private doubleClickThreshold: number = 300; // ms
  private isDragging: boolean = false;
  private dragStart: { x: number; y: number } = { x: 0, y: 0 };
  private currentRegion: string | null = null;

  /**
   * Register a UI region for mouse interaction
   */
  registerRegion(region: UIRegion): void {
    this.regions.set(region.name, region);
  }

  /**
   * Unregister a UI region
   */
  unregisterRegion(name: string): void {
    this.regions.delete(name);
  }

  /**
   * Clear all regions
   */
  clearRegions(): void {
    this.regions.clear();
  }

  /**
   * Enable/disable a region
   */
  setRegionEnabled(name: string, enabled: boolean): void {
    const region = this.regions.get(name);
    if (region) {
      region.enabled = enabled;
    }
  }

  /**
   * Handle mouse click
   */
  handleClick(event: MouseEvent): void {
    const region = this.findRegionAt(event.x, event.y);
    if (!region || !region.enabled) return;

    // Check for double-click
    const now = Date.now();
    const timeSinceLastClick = now - this.lastClickTime;
    const isSamePosition =
      Math.abs(event.x - this.lastClickPos.x) <= 2 &&
      Math.abs(event.y - this.lastClickPos.y) <= 2;

    if (timeSinceLastClick < this.doubleClickThreshold && isSamePosition) {
      // Double-click
      if (region.onDoubleClick) {
        region.onDoubleClick(event);
      }
      this.lastClickTime = 0; // Reset to prevent triple-click
    } else {
      // Single click
      if (region.onClick) {
        region.onClick(event);
      }
      this.lastClickTime = now;
      this.lastClickPos = { x: event.x, y: event.y };
    }

    this.currentRegion = region.name;
  }

  /**
   * Handle mouse drag start
   */
  handleDragStart(event: MouseEvent): void {
    const region = this.findRegionAt(event.x, event.y);
    if (!region || !region.enabled || !region.onDrag) return;

    this.isDragging = true;
    this.dragStart = { x: event.x, y: event.y };
    this.currentRegion = region.name;
  }

  /**
   * Handle mouse drag
   */
  handleDrag(event: MouseEvent): void {
    if (!this.isDragging || !this.currentRegion) return;

    const region = this.regions.get(this.currentRegion);
    if (region && region.enabled && region.onDrag) {
      region.onDrag(event, this.dragStart.x, this.dragStart.y);
    }
  }

  /**
   * Handle mouse drag end
   */
  handleDragEnd(): void {
    this.isDragging = false;
    this.currentRegion = null;
  }

  /**
   * Handle mouse wheel
   */
  handleWheel(event: MouseEvent): void {
    const region = this.findRegionAt(event.x, event.y);
    if (!region || !region.enabled || !region.onWheel) return;

    region.onWheel(event);
  }

  /**
   * Handle mouse move (for hover effects, tooltips, etc.)
   */
  handleMove(event: MouseEvent): void {
    // Update current region under cursor
    const region = this.findRegionAt(event.x, event.y);
    if (region) {
      this.currentRegion = region.name;
    }
  }

  /**
   * Find region at coordinates
   */
  private findRegionAt(x: number, y: number): UIRegion | null {
    // Check regions in reverse order (top to bottom in z-order)
    const regions = Array.from(this.regions.values()).reverse();

    for (const region of regions) {
      if (
        x >= region.x &&
        x < region.x + region.width &&
        y >= region.y &&
        y < region.y + region.height &&
        region.enabled
      ) {
        return region;
      }
    }

    return null;
  }

  /**
   * Get current region under cursor
   */
  getCurrentRegion(): string | null {
    return this.currentRegion;
  }

  /**
   * Check if currently dragging
   */
  isDraggingNow(): boolean {
    return this.isDragging;
  }
}

/**
 * Parse ANSI mouse event sequences
 * Supports xterm mouse tracking
 */
export class ANSIMouseParser {
  /**
   * Parse xterm mouse event
   * Format: ESC[<b;x;yM or ESC[<b;x;ym
   */
  static parseXtermMouse(sequence: string): MouseEvent | null {
    // SGR mouse format: ESC[<b;x;yM or ESC[<b;x;ym
    const match = sequence.match(/\x1b\[<(\d+);(\d+);(\d+)([Mm])/);
    if (!match) return null;

    const [, buttonStr, xStr, yStr, action] = match;
    const button = parseInt(buttonStr);
    const x = parseInt(xStr) - 1; // Convert to 0-based
    const y = parseInt(yStr) - 1;

    // Button mapping
    let mouseButton: 'left' | 'right' | 'middle' = 'left';
    if ((button & 3) === 0) mouseButton = 'left';
    else if ((button & 3) === 1) mouseButton = 'middle';
    else if ((button & 3) === 2) mouseButton = 'right';

    // Modifiers
    const shift = (button & 4) !== 0;
    const alt = (button & 8) !== 0;
    const ctrl = (button & 16) !== 0;

    // Event type
    let type: MouseEvent['type'] = 'click';
    if (action === 'M') {
      type = 'click';
    } else if (action === 'm') {
      type = 'click'; // Release, treat as click completion
    }

    // Check for scroll wheel
    if ((button & 64) !== 0) {
      type = 'wheel';
      const deltaY = (button & 1) ? 1 : -1;
      return { type, x, y, button: mouseButton, shift, ctrl, alt, deltaY };
    }

    return { type, x, y, button: mouseButton, shift, ctrl, alt };
  }

  /**
   * Enable xterm mouse tracking
   * Returns ANSI sequences to send to terminal
   */
  static enableMouseTracking(): string {
    return '\x1b[?1000h\x1b[?1002h\x1b[?1006h'; // Enable mouse tracking, button events, SGR mode
  }

  /**
   * Disable xterm mouse tracking
   */
  static disableMouseTracking(): string {
    return '\x1b[?1000l\x1b[?1002l\x1b[?1006l';
  }
}
