/**
 * Responsive Layout System
 *
 * Provides automatic terminal resize handling and responsive layouts
 *
 * Features:
 * - Automatic resize detection and handling
 * - Percentage-based layouts that adapt to terminal size
 * - Constraint-based positioning
 * - Breakpoints for different terminal sizes
 * - Layout managers (FlexLayout, GridLayout)
 */

import type { Element } from '../core/element';
import type { Screen } from '../core/screen';

export interface LayoutConstraints {
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
  aspectRatio?: number;  // width / height
}

export interface ResponsiveConfig {
  breakpoints?: {
    xs?: number;       // < 50 cols (Mobile Auto-Flow)
    small?: number;    // < 80 cols
    medium?: number;   // < 120 cols
    large?: number;    // >= 120 cols
  };
  enableAutoResize?: boolean;
  preserveAspectRatio?: boolean;
}

export interface FlexLayoutOptions {
  direction: 'row' | 'column';
  gap?: number;
  padding?: number;
  wrap?: boolean;
}

export interface GridLayoutOptions {
  columns: number;
  rows?: number;
  gap?: number;
  padding?: number;
}

/**
 * Responsive Layout Manager
 * Handles automatic resizing and responsive behavior for blessed screens
 */
export class ResponsiveLayoutManager {
  private screen: Screen;
  private resizeHandlers: Set<(width: number, height: number) => void> = new Set();
  private elements: Map<Element, LayoutConstraints> = new Map();
  private config: ResponsiveConfig;

  constructor(screen: Screen, config: ResponsiveConfig = {}) {
    this.screen = screen;
    this.config = {
      breakpoints: {
        xs: 50,
        small: 80,
        medium: 120,
        large: 160,
        ...config.breakpoints,
      },
      enableAutoResize: config.enableAutoResize !== false,
      preserveAspectRatio: config.preserveAspectRatio || false,
    };

    if (this.config.enableAutoResize) {
      this.setupResizeHandling();
    }
  }

  /**
   * Setup automatic resize detection
   */
  private setupResizeHandling(): void {
    // Listen for terminal resize events
    this.screen.on('resize', () => {
      const width = this.screen.width;
      const height = this.screen.height;
      this.handleResize(width, height);
    });
  }

  /**
   * Handle terminal resize
   */
  private handleResize(width: number, height: number): void {
    // Apply constraints to all registered elements
    for (const [element, constraints] of this.elements) {
      this.applyConstraints(element, constraints, width, height);
    }

    // Trigger custom handlers
    for (const handler of this.resizeHandlers) {
      handler(width, height);
    }

    // Re-render
    this.screen.render();
  }

  /**
   * Register an element with layout constraints
   */
  registerElement(element: Element, constraints: LayoutConstraints): void {
    this.elements.set(element, constraints);

    // Apply constraints immediately
    const width = this.screen.width;
    const height = this.screen.height;
    this.applyConstraints(element, constraints, width, height);
  }

  /**
   * Unregister an element
   */
  unregisterElement(element: Element): void {
    this.elements.delete(element);
  }

  /**
   * Apply constraints to an element
   */
  private applyConstraints(
    element: Element,
    constraints: LayoutConstraints,
    screenWidth: number,
    screenHeight: number
  ): void {
    const opts = element.options;

    // Calculate dimensions based on percentage or fixed values
    let width = this.resolveSize(opts.width, screenWidth);
    let height = this.resolveSize(opts.height, screenHeight);

    // Apply min/max constraints
    if (constraints.minWidth !== undefined) {
      width = Math.max(width, constraints.minWidth);
    }
    if (constraints.maxWidth !== undefined) {
      width = Math.min(width, constraints.maxWidth);
    }
    if (constraints.minHeight !== undefined) {
      height = Math.max(height, constraints.minHeight);
    }
    if (constraints.maxHeight !== undefined) {
      height = Math.min(height, constraints.maxHeight);
    }

    // Apply aspect ratio if specified
    if (constraints.aspectRatio !== undefined) {
      const currentRatio = width / height;
      if (Math.abs(currentRatio - constraints.aspectRatio) > 0.01) {
        if (currentRatio > constraints.aspectRatio) {
          width = Math.floor(height * constraints.aspectRatio);
        } else {
          height = Math.floor(width / constraints.aspectRatio);
        }
      }
    }

    // Update element dimensions via position (not options which is only read at construction)
    element.position.width = width;
    element.position.height = height;
  }

  /**
   * Resolve size value (percentage or fixed)
   */
  private resolveSize(value: any, screenSize: number): number {
    if (typeof value === 'string' && value.endsWith('%')) {
      const percent = parseFloat(value) / 100;
      return Math.floor(screenSize * percent);
    }
    return typeof value === 'number' ? value : screenSize;
  }

  /**
   * Register a custom resize handler
   */
  onResize(handler: (width: number, height: number) => void): () => void {
    this.resizeHandlers.add(handler);

    // Return unsubscribe function
    return () => {
      this.resizeHandlers.delete(handler);
    };
  }

  /**
   * Get current breakpoint
   */
  getBreakpoint(): 'xs' | 'small' | 'medium' | 'large' {
    const width = this.screen.width;
    const { xs = 50, small = 80, medium = 120 } = this.config.breakpoints || {};

    if (width < xs) return 'xs';
    if (width < small) return 'small';
    if (width < medium) return 'medium';
    return 'large';
  }

  /**
   * Create a flex layout
   */
  createFlexLayout(parent: Element, children: Element[], options: FlexLayoutOptions): void {
    const { direction, gap = 0, padding = 0, wrap = false } = options;
    const availableWidth = parent.width - (padding * 2);
    const availableHeight = parent.height - (padding * 2);

    if (direction === 'row') {
      this.layoutRow(parent, children, availableWidth, availableHeight, gap, padding, wrap);
    } else {
      this.layoutColumn(parent, children, availableWidth, availableHeight, gap, padding, wrap);
    }
  }

  /**
   * Layout children in a row
   */
  private layoutRow(
    parent: Element,
    children: Element[],
    availableWidth: number,
    availableHeight: number,
    gap: number,
    padding: number,
    wrap: boolean
  ): void {
    let x = padding;
    let y = padding;
    let rowHeight = 0;

    for (const child of children) {
      const childWidth = this.resolveSize(child.options.width, availableWidth);
      const childHeight = this.resolveSize(child.options.height, availableHeight);

      // Wrap to next row if needed
      if (wrap && x + childWidth > availableWidth) {
        x = padding;
        y += rowHeight + gap;
        rowHeight = 0;
      }

      // Use position.* for runtime updates (not options.* which is only read at construction)
      child.position.left = x;
      child.position.top = y;
      child.position.width = childWidth;
      child.position.height = childHeight;

      x += childWidth + gap;
      rowHeight = Math.max(rowHeight, childHeight);
    }
  }

  /**
   * Layout children in a column
   */
  private layoutColumn(
    parent: Element,
    children: Element[],
    availableWidth: number,
    availableHeight: number,
    gap: number,
    padding: number,
    wrap: boolean
  ): void {
    let x = padding;
    let y = padding;
    let colWidth = 0;

    for (const child of children) {
      const childWidth = this.resolveSize(child.options.width, availableWidth);
      const childHeight = this.resolveSize(child.options.height, availableHeight);

      // Wrap to next column if needed
      if (wrap && y + childHeight > availableHeight) {
        y = padding;
        x += colWidth + gap;
        colWidth = 0;
      }

      // Use position.* for runtime updates (not options.* which is only read at construction)
      child.position.left = x;
      child.position.top = y;
      child.position.width = childWidth;
      child.position.height = childHeight;

      y += childHeight + gap;
      colWidth = Math.max(colWidth, childWidth);
    }
  }

  /**
   * Create a grid layout
   */
  createGridLayout(parent: Element, children: Element[], options: GridLayoutOptions): void {
    const { columns, rows, gap = 0, padding = 0 } = options;
    const availableWidth = parent.width - (padding * 2);
    const availableHeight = parent.height - (padding * 2);

    const cellWidth = Math.floor((availableWidth - (gap * (columns - 1))) / columns);
    const actualRows = rows || Math.ceil(children.length / columns);
    const cellHeight = Math.floor((availableHeight - (gap * (actualRows - 1))) / actualRows);

    children.forEach((child, index) => {
      const col = index % columns;
      const row = Math.floor(index / columns);

      // Use position.* for runtime updates (not options.* which is only read at construction)
      child.position.left = padding + (col * (cellWidth + gap));
      child.position.top = padding + (row * (cellHeight + gap));
      child.position.width = cellWidth;
      child.position.height = cellHeight;
    });
  }

  /**
   * Clear all registered elements and handlers
   */
  destroy(): void {
    this.elements.clear();
    this.resizeHandlers.clear();
  }
}
