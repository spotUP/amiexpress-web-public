/**
 * Panel widget - Box with focus group for multi-panel layouts
 *
 * Features:
 * - Visual indication when panel is active (has focused child)
 * - Can be activated with Alt+<number> shortcuts
 * - F6 cycles through panels
 *
 * Responsive features:
 * - Touch-friendly title bar (min 3 rows height on mobile)
 * - Collapsible on mobile (tap title to expand/collapse)
 * - Swipe gestures for panel navigation
 * - Automatic layout adaptation on breakpoint changes
 */

import { Box, BoxOptions } from './box';
import type { Padding } from '../core/types';
import type { ResponsiveState } from '../core/responsive-mixin';
import type { BreakpointName } from '../core/responsive-constants';
import { MIN_TOUCH_HEIGHT, isMobileWidth } from '../core/responsive-constants';

export interface PanelOptions extends BoxOptions {
  panelIndex?: number;  // For Alt+<number> shortcut (1-9)
  title?: string;       // Panel title
  /** Enable collapse on mobile (default: false) */
  collapsibleOnMobile?: boolean;
  /** Start collapsed on mobile (default: false) */
  startCollapsed?: boolean;
  /** Collapsed height in rows (default: 3 for touch-friendly) */
  collapsedHeight?: number;
  /** Enable swipe to navigate between panels (default: true on mobile) */
  swipeNavigation?: boolean;
}

export class Panel extends Box {
  private panelIndex?: number;
  private _isActive: boolean = false;
  private lastFocusedChild: any = null;
  private _focusing: boolean = false;

  // Mobile/responsive state
  private _isCollapsed: boolean = false;
  private _collapsibleOnMobile: boolean;
  private _collapsedHeight: number;
  private _expandedHeight: number | string | null = null;
  private _swipeNavigation: boolean;
  private _unsubscribeSwipe?: () => void;
  private _title: string;

  constructor(options: PanelOptions = {}) {
    super({
      ...options,
      border: 'border' in options ? (options.border || undefined) : { type: 'line', fg: 'blue' },
      focusable: options.focusable ?? false,
      keys: options.keys ?? false,
      mouse: options.mouse ?? false,
      clickable: options.clickable ?? false,
      style: {
        fg: 'white',
        bg: 'black',
        focus: {
          fg: 'white',
          bg: 'black',
        },
        ...options.style,
      },
    });

    this.panelIndex = options.panelIndex;
    this._title = options.title || '';
    this._collapsibleOnMobile = options.collapsibleOnMobile ?? false;
    this._collapsedHeight = options.collapsedHeight ?? MIN_TOUCH_HEIGHT;
    this._swipeNavigation = options.swipeNavigation ?? true;

    // Set label if title provided
    if (options.title) {
      this.options.label = ` ${options.title} `;
    }

    // Focus panel when clicked anywhere on it (including when children are clicked)
    this.on('click', () => {
      this.focus();
    });

    // Handle title bar click for collapse/expand on mobile
    this.on('click', (data: any) => {
      if (this._collapsibleOnMobile && this.isMobile()) {
        // Check if click is in the title bar area (top 3 rows)
        const relativeY = data?.y !== undefined ? data.y - (this.position?.yi || 0) : 0;
        if (relativeY < MIN_TOUCH_HEIGHT) {
          this.toggleCollapse();
        }
      }
    });

    // Handle focus redirection to last active child
    this.on('focus', () => {
      if (this._focusing) return;

      // Don't redirect focus if collapsed
      if (this._isCollapsed) return;

      if (this.lastFocusedChild && !this.lastFocusedChild.destroyed && this.lastFocusedChild.visible) {
        this._focusing = true;
        // Use setImmediate/timeout to avoid recursive focus calls during tree walk
        setTimeout(() => {
          if (this.lastFocusedChild && !this.lastFocusedChild.destroyed) {
            this.lastFocusedChild.focus();
          }
          this._focusing = false;
        }, 0);
      }
    });

    // Track active state based on child focus
    if (this.screen) {
      this.screen.on('element focus', (el: any) => {
        // Check if focused element is a descendant of this panel
        const isDescendant = this._isDescendantOf(el, this);
        if (isDescendant) {
          if (el !== this) {
            this.lastFocusedChild = el;
          }
          if (!this._isActive) {
            this._activate();
          }
        } else if (this._isActive) {
          this._deactivate();
        }
      });
    }

    // Register Alt+<number> shortcut if panel index is set
    if (this.panelIndex && this.panelIndex >= 1 && this.panelIndex <= 9) {
      const altKey = `M-${this.panelIndex}`;  // Alt+1, Alt+2, etc.
      if (this.screen) {
        (this.screen as any).key([altKey], () => {
          this.activate();
        });
      }
    }

    // Check if we should start collapsed
    if (options.startCollapsed && this._collapsibleOnMobile) {
      // Delay collapse check until attached to screen
      this.once('attach', () => {
        if (this.isMobile()) {
          this._collapse();
        }
      });
    }
  }

  /**
   * Check if element is a descendant of parent
   */
  private _isDescendantOf(element: any, parent: any): boolean {
    let current = element;
    while (current) {
      if (current === parent) return true;
      current = current.parent;
    }
    return false;
  }

  /**
   * Activate panel (focus first focusable child)
   */
  activate(): void {
    // Find first focusable child
    const focusable = this._getFirstFocusable(this);
    if (focusable) {
      focusable.focus();
    } else {
      // No focusable children, focus the panel itself
      this.focus();
    }
  }

  /**
   * Get first focusable descendant
   */
  private _getFirstFocusable(element: any): any {
    if (element.options.focusable && element !== this) {
      return element;
    }
    for (const child of element.children || []) {
      const focusable = this._getFirstFocusable(child);
      if (focusable) return focusable;
    }
    return null;
  }

  /**
   * Mark panel as active (internal)
   */
  private _activate(): void {
    if (this._isActive) return;
    this._isActive = true;
    
    // Brighten style when active
    if (this.style) {
      this.style.fg = 'white';
      if (this.style.border) this.style.border.fg = 'cyan';
    }

    this.emit('activate');
    if (this.screen) {
      this.screen.render();
    }
  }

  /**
   * Mark panel as inactive (internal)
   */
  private _deactivate(): void {
    if (!this._isActive) return;
    this._isActive = false;

    // Dim style when inactive
    if (this.style) {
      this.style.fg = 'gray';
      if (this.style.border) this.style.border.fg = 'blue';
    }

    this.emit('deactivate');
    if (this.screen) {
      this.screen.render();
    }
  }

  /**
   * Check if panel is currently active
   */
  isActive(): boolean {
    return this._isActive;
  }

  // ============================================================================
  // Responsive Methods
  // ============================================================================

  /**
   * Handle resize - update layout based on screen size
   */
  protected _handleResize(width: number, height: number, state: ResponsiveState): void {
    // Call parent resize handler first
    super._handleResize(width, height, state);

    // Update title bar indicator on mobile
    if (state.isMobile && this._collapsibleOnMobile) {
      this._updateCollapseIndicator();
    }
  }

  /**
   * Handle breakpoint change
   */
  protected _handleBreakpointChange(
    breakpoint: BreakpointName,
    previousBreakpoint: BreakpointName,
    state: ResponsiveState
  ): void {
    // Call parent handler first
    super._handleBreakpointChange(breakpoint, previousBreakpoint, state);

    // Emit for custom handling
    this.emit('breakpoint-change', breakpoint, previousBreakpoint);
  }

  /**
   * Called when entering mobile mode
   */
  protected _enterMobileMode(): void {
    // Enable swipe navigation on mobile
    if (this._swipeNavigation && !this._unsubscribeSwipe) {
      this._unsubscribeSwipe = this.enableSwipe({
        direction: 'horizontal',
        onSwipe: (event) => {
          // Emit swipe event for parent containers to handle panel navigation
          this.emit('swipe', event.direction);
          if (event.direction === 'left') {
            this.emit('swipe-next');
          } else if (event.direction === 'right') {
            this.emit('swipe-prev');
          }
        },
      });
    }

    // Update collapse indicator
    if (this._collapsibleOnMobile) {
      this._updateCollapseIndicator();
    }

    this.emit('enter-mobile');
  }

  /**
   * Called when exiting mobile mode
   */
  protected _exitMobileMode(): void {
    // Disable swipe navigation
    if (this._unsubscribeSwipe) {
      this._unsubscribeSwipe();
      this._unsubscribeSwipe = undefined;
    }

    // Expand if collapsed
    if (this._isCollapsed) {
      this._expand();
    }

    // Remove collapse indicator from label
    if (this._title) {
      this.options.label = ` ${this._title} `;
    }

    this.emit('exit-mobile');
  }

  // ============================================================================
  // Collapse/Expand Methods
  // ============================================================================

  /**
   * Toggle collapsed state
   */
  toggleCollapse(): void {
    if (this._isCollapsed) {
      this._expand();
    } else {
      this._collapse();
    }
  }

  /**
   * Collapse the panel to title bar only
   */
  private _collapse(): void {
    if (this._isCollapsed) return;

    // Store expanded height
    this._expandedHeight = this.options.height ?? null;

    // Set collapsed height
    this.options.height = this._collapsedHeight;
    this.position.height = this._collapsedHeight;

    // Hide children
    for (const child of this.children) {
      if (child !== this) {
        (child as any)._wasVisible = child.visible;
        child.hide();
      }
    }

    this._isCollapsed = true;
    this._updateCollapseIndicator();
    this.emit('collapse');

    if (this.screen) {
      this.screen.render();
    }
  }

  /**
   * Expand the panel to full size
   */
  private _expand(): void {
    if (!this._isCollapsed) return;

    // Restore expanded height
    if (this._expandedHeight !== null) {
      this.options.height = this._expandedHeight;
      if (typeof this._expandedHeight === 'number') {
        this.position.height = this._expandedHeight;
      }
    }

    // Show children that were visible before collapse
    for (const child of this.children) {
      if (child !== this && (child as any)._wasVisible !== false) {
        child.show();
      }
    }

    this._isCollapsed = false;
    this._updateCollapseIndicator();
    this.emit('expand');

    if (this.screen) {
      this.screen.render();
    }
  }

  /**
   * Update the collapse/expand indicator in the title
   */
  private _updateCollapseIndicator(): void {
    if (!this._collapsibleOnMobile) return;

    const indicator = this._isCollapsed ? '[+]' : '[-]';
    const title = this._title || '';
    this.options.label = ` ${indicator} ${title} `;
  }

  /**
   * Check if panel is collapsed
   */
  isCollapsed(): boolean {
    return this._isCollapsed;
  }

  /**
   * Set collapsible on mobile
   */
  setCollapsibleOnMobile(enabled: boolean): void {
    this._collapsibleOnMobile = enabled;
    if (this.isMobile()) {
      this._updateCollapseIndicator();
    }
  }

  /**
   * Get panel title
   */
  getTitle(): string {
    return this._title;
  }

  /**
   * Set panel title
   */
  setTitle(title: string): void {
    this._title = title;
    if (this._collapsibleOnMobile && this.isMobile()) {
      this._updateCollapseIndicator();
    } else {
      this.options.label = ` ${title} `;
    }
    if (this.screen) {
      this.screen.render();
    }
  }

  /**
   * Override destroy to clean up swipe handler
   */
  destroy(): void {
    if (this._unsubscribeSwipe) {
      this._unsubscribeSwipe();
      this._unsubscribeSwipe = undefined;
    }
    super.destroy();
  }
}
