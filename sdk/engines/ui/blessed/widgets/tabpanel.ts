/**
 * TabPanel Widget
 * Manages multiple views with a horizontal tab bar
 *
 * Responsive features:
 * - Swipe navigation between tabs on mobile
 * - Touch-friendly tab bar (larger height on mobile)
 * - Carousel-style navigation with swipe gestures
 */

import { Box, BoxOptions } from './box';
import { Button } from './button';
import { Element } from '../core/element';
import type { TabPanelOptions, Colors } from '../core/types';
import type { ResponsiveState } from '../core/responsive-mixin';
import type { BreakpointName } from '../core/responsive-constants';
import { MIN_TOUCH_HEIGHT } from '../core/responsive-constants';

export interface ExtendedTabPanelOptions extends TabPanelOptions {
  /** Enable swipe navigation on mobile (default: true) */
  swipeNavigation?: boolean;
  /** Touch-friendly bar height on mobile (default: MIN_TOUCH_HEIGHT) */
  mobileBarHeight?: number;
}

export class TabPanel extends Box {
  private tabButtons: Button[] = [];
  private tabContents: Element[] = [];
  private activeTabIndex: number = 0;
  private _desktopBarHeight: number;
  private _mobileBarHeight: number;
  private barHeight: number;
  private tabStyle: Colors;
  private activeTabStyle: Colors;
  private _swipeNavigation: boolean;
  private _unsubscribeSwipe?: () => void;

  constructor(options: ExtendedTabPanelOptions) {
    super({
      ...options,
    });

    this._desktopBarHeight = options.barHeight || 1;
    this._mobileBarHeight = options.mobileBarHeight ?? MIN_TOUCH_HEIGHT;
    this.barHeight = this._desktopBarHeight;
    this.tabStyle = options.style?.tab || { fg: 'white', bg: 'black' };
    this.activeTabStyle = options.style?.activeTab || { fg: 'black', bg: 'cyan', bold: true };
    this._swipeNavigation = options.swipeNavigation !== false;  // Default: enabled

    // Initialize tabs
    if (options.tabs) {
      options.tabs.forEach((tab, index) => {
        this.addTab(tab.label, tab.content);
      });
    }

    this.selectTab(options.activeTab || 0);

    // Keyboard navigation: Alt + 1-9 to select tabs
    this.on('keypress', (ch, key) => {
      if (key.meta && /^[1-9]$/.test(key.name)) {
        const index = parseInt(key.name) - 1;
        this.selectTab(index);
        return true;
      }
      // Arrow key navigation
      if (key.name === 'left') {
        this.previousTab();
        return true;
      }
      if (key.name === 'right') {
        this.nextTab();
        return true;
      }
      return false;
    });
  }

  /**
   * Add a new tab
   */
  addTab(label: string, content: string | Element): void {
    const index = this.tabButtons.length;
    
    // Calculate button position
    let left = 0;
    if (index > 0) {
      const prevButton = this.tabButtons[index - 1];
      left = (prevButton.aleft - this.aleft) + (prevButton.width as number) + 1;
    }

    // Create tab button
    const button = new Button({
      parent: this,
      top: 0,
      left,
      height: this.barHeight,
      width: label.length + 2,
      content: ` ${label} `,
      padding: 0,
      style: this.tabStyle,
      border: undefined,
    });

    button.on('press', () => {
      this.selectTab(index);
    });

    this.tabButtons.push(button);

    // Create or prepare content element
    let contentElement: Element;
    if (typeof content === 'string') {
      contentElement = new Box({
        parent: this,
        top: this.barHeight,
        left: 0,
        right: 0,
        bottom: 0,
        content,
        hidden: true,
      });
    } else {
      contentElement = content;
      contentElement.parent = this;
      contentElement.top = this.barHeight;
      contentElement.left = 0;
      contentElement.right = 0;
      contentElement.bottom = 0;
      contentElement.hide();
      this.append(contentElement);
    }

    this.tabContents.push(contentElement);
  }

  /**
   * Select a tab by index
   */
  selectTab(index: number): void {
    if (index < 0 || index >= this.tabButtons.length) return;

    // Update active index
    const prevIndex = this.activeTabIndex;
    this.activeTabIndex = index;

    // Update styles
    if (this.tabButtons[prevIndex]) {
      this.tabButtons[prevIndex].setStyle(this.tabStyle);
      this.tabContents[prevIndex].hide();
    }

    this.tabButtons[index].setStyle(this.activeTabStyle);
    this.tabContents[index].show();

    this.emit('tab-change', index, prevIndex);
    this.screen?.render();
  }

  /**
   * Get active tab index
   */
  getActiveTab(): number {
    return this.activeTabIndex;
  }

  /**
   * Get number of tabs
   */
  getTabCount(): number {
    return this.tabButtons.length;
  }

  get type(): string {
    return 'tabpanel';
  }

  /**
   * Select next tab (with wraparound)
   */
  nextTab(): void {
    const nextIndex = (this.activeTabIndex + 1) % this.tabButtons.length;
    this.selectTab(nextIndex);
  }

  /**
   * Select previous tab (with wraparound)
   */
  previousTab(): void {
    const prevIndex = (this.activeTabIndex - 1 + this.tabButtons.length) % this.tabButtons.length;
    this.selectTab(prevIndex);
  }

  // ============================================================================
  // Responsive Lifecycle Hooks
  // ============================================================================

  /**
   * Handle resize - adjust tab bar layout
   */
  protected _handleResize(width: number, height: number, state: ResponsiveState): void {
    // Call parent resize handler
    super._handleResize(width, height, state);

    // Reposition tab buttons if needed (for narrow screens)
    this._relayoutTabButtons();
  }

  /**
   * Handle breakpoint change - adjust bar height
   */
  protected _handleBreakpointChange(
    breakpoint: BreakpointName,
    previousBreakpoint: BreakpointName,
    state: ResponsiveState
  ): void {
    // Call parent handler
    super._handleBreakpointChange(breakpoint, previousBreakpoint, state);

    // Update bar height based on breakpoint
    if (state.isMobile) {
      this._setBarHeight(this._mobileBarHeight);
    } else {
      this._setBarHeight(this._desktopBarHeight);
    }

    // Emit for custom handling
    this.emit('breakpoint-change', breakpoint, previousBreakpoint);
  }

  /**
   * Called when entering mobile mode - enable swipe navigation
   */
  protected _enterMobileMode(): void {
    // Update bar height for touch-friendly targets
    this._setBarHeight(this._mobileBarHeight);

    // Enable swipe navigation on mobile
    if (this._swipeNavigation && !this._unsubscribeSwipe) {
      this._unsubscribeSwipe = this.enableSwipe({
        direction: 'horizontal',
        onSwipe: (event) => {
          if (event.direction === 'left') {
            this.nextTab();
          } else if (event.direction === 'right') {
            this.previousTab();
          }
        },
      });
    }

    this.emit('enter-mobile');
  }

  /**
   * Called when exiting mobile mode - disable swipe navigation
   */
  protected _exitMobileMode(): void {
    // Restore desktop bar height
    this._setBarHeight(this._desktopBarHeight);

    // Disable swipe navigation
    if (this._unsubscribeSwipe) {
      this._unsubscribeSwipe();
      this._unsubscribeSwipe = undefined;
    }

    this.emit('exit-mobile');
  }

  /**
   * Set bar height and relayout
   */
  private _setBarHeight(height: number): void {
    if (this.barHeight === height) return;

    this.barHeight = height;

    // Update button heights
    for (const button of this.tabButtons) {
      button.height = height;
    }

    // Update content positions
    for (const content of this.tabContents) {
      content.top = height;
    }

    if (this.screen) {
      this.screen.render();
    }
  }

  /**
   * Relayout tab buttons (for narrow screens)
   */
  private _relayoutTabButtons(): void {
    const containerWidth = typeof this.width === 'number' ? this.width : 80;
    let currentX = 0;

    for (const button of this.tabButtons) {
      const buttonWidth = button.width as number;

      // Wrap to next line if overflow (future enhancement)
      // For now, just position sequentially
      button.left = currentX;
      currentX += buttonWidth + 1;
    }

    if (this.screen) {
      this.screen.render();
    }
  }

  /**
   * Enable/disable swipe navigation
   */
  setSwipeNavigation(enabled: boolean): void {
    this._swipeNavigation = enabled;
    if (this.isMobile()) {
      if (enabled && !this._unsubscribeSwipe) {
        this._enterMobileMode();
      } else if (!enabled && this._unsubscribeSwipe) {
        this._unsubscribeSwipe();
        this._unsubscribeSwipe = undefined;
      }
    }
  }

  /**
   * Override destroy to clean up
   */
  destroy(): void {
    if (this._unsubscribeSwipe) {
      this._unsubscribeSwipe();
      this._unsubscribeSwipe = undefined;
    }
    super.destroy();
  }
}

/**
 * Factory function
 */
export function tabpanel(options: ExtendedTabPanelOptions): TabPanel {
  return new TabPanel(options);
}
