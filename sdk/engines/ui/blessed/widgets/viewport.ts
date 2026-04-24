/**
 * Viewport - Scrollable viewport for content larger than container
 *
 * Responsive features:
 * - Swipe scrolling on mobile (vertical swipe to scroll)
 * - Touch inertia (momentum scrolling)
 * - Responsive scroll speed based on breakpoint
 */

import { Box, BoxOptions } from './box';
import type { ResponsiveState } from '../core/responsive-mixin';
import type { BreakpointName } from '../core/responsive-constants';
import { SCROLL_MOMENTUM_DECAY, MIN_SCROLL_VELOCITY } from '../core/responsive-constants';

export interface ViewportOptions extends BoxOptions {
  alwaysScroll?: boolean;
  baseLimit?: number;
  scrollbarBg?: string;
  scrollbarFg?: string;
  /** Enable swipe scrolling on mobile (default: true) */
  swipeScrolling?: boolean;
  /** Enable momentum/inertia scrolling (default: true) */
  momentumScrolling?: boolean;
  /** Scroll speed multiplier on mobile (default: 2) */
  mobileScrollSpeed?: number;
}

export class Viewport extends Box {
  private alwaysScroll: boolean;
  private baseLimit: number;
  private scrollPosition: number = 0;
  private contentHeight: number = 0;

  // Swipe/momentum scrolling state
  private _swipeScrolling: boolean;
  private _momentumScrolling: boolean;
  private _mobileScrollSpeed: number;
  private _scrollVelocity: number = 0;
  private _momentumTimer?: ReturnType<typeof setInterval>;
  private _unsubscribeSwipe?: () => void;

  constructor(options: ViewportOptions = {}) {
    const {
      alwaysScroll,
      baseLimit,
      scrollbarBg,
      scrollbarFg,
      swipeScrolling,
      momentumScrolling,
      mobileScrollSpeed,
      ...boxOptions
    } = options;

    super({
      ...boxOptions,
      scrollable: true,
      alwaysScroll: alwaysScroll !== false,
      // Viewport is always focusable so viewport.focus() works and key handlers fire.
      // The Element base defaults focusable to false; override unless caller explicitly
      // sets focusable: false.
      focusable: boxOptions.focusable !== false,
      // Amiga-safe scrollbar: space with bg colors (no Unicode needed)
      scrollbar: options.scrollbar !== undefined ? options.scrollbar : {
        ch: ' ',
        track: { ch: ' ', style: { bg: 'black' } },
        style: { bg: scrollbarBg || 'cyan' },
      },
    });

    this.alwaysScroll = alwaysScroll !== false;
    this.baseLimit = baseLimit || 10000;
    this._swipeScrolling = swipeScrolling !== false;  // Default: enabled
    this._momentumScrolling = momentumScrolling !== false;  // Default: enabled
    this._mobileScrollSpeed = mobileScrollSpeed ?? 2;

    // Enable keyboard scrolling
    this.enableKeys();

    // Scroll keys
    this.key(['up', 'k'], () => {
      this.scroll(-1);
    });

    this.key(['down', 'j'], () => {
      this.scroll(1);
    });

    this.key(['pageup'], () => {
      const viewportHeight = typeof this.height === 'number' ? this.height : 20;
      this.scroll(-Math.floor(viewportHeight / 2));
    });

    this.key(['pagedown'], () => {
      const viewportHeight = typeof this.height === 'number' ? this.height : 20;
      this.scroll(Math.floor(viewportHeight / 2));
    });

    this.key(['home'], () => {
      this.scrollTo(0);
    });

    this.key(['end'], () => {
      this.scrollTo(this.contentHeight);
    });

    // Mouse wheel support
    if (options.mouse !== false) {
      this.enableMouse();

      this.on('wheeldown', () => {
        this.scroll(3);
      });

      this.on('wheelup', () => {
        this.scroll(-3);
      });
    }
  }

  /**
   * Scroll by delta
   */
  scroll(offset: number): void {
    const newPosition = this.scrollPosition + offset;
    this.scrollTo(newPosition);
  }

  /**
   * Scroll to absolute position
   */
  scrollTo(position: number): void {
    const viewportHeight = typeof this.height === 'number' ? this.height : 20;
    const maxScroll = Math.max(0, this.contentHeight - viewportHeight);

    this.scrollPosition = Math.max(0, Math.min(position, maxScroll));
    this.setScrollPerc((this.scrollPosition / maxScroll) * 100 || 0);

    this.emit('scroll', this.scrollPosition);

    if (this.screen) {
      this.screen.render();
    }
  }

  /**
   * Get scroll position
   */
  getScrollPosition(): number {
    return this.scrollPosition;
  }

  /**
   * Get scroll percentage
   */
  getScrollPerc(): number {
    const viewportHeight = typeof this.height === 'number' ? this.height : 20;
    const maxScroll = Math.max(0, this.contentHeight - viewportHeight);
    return maxScroll > 0 ? (this.scrollPosition / maxScroll) * 100 : 0;
  }

  /**
   * Set content and update scrollable height
   */
  setContent(content: string): void {
    super.setContent(content);

    // Calculate content height
    const lines = content.split('\n');
    this.contentHeight = lines.length;

    // Adjust scroll position if needed
    const viewportHeight = typeof this.height === 'number' ? this.height : 20;
    const maxScroll = Math.max(0, this.contentHeight - viewportHeight);
    if (this.scrollPosition > maxScroll) {
      this.scrollTo(maxScroll);
    }
  }

  /**
   * Get content height
   */
  getContentHeight(): number {
    return this.contentHeight;
  }

  /**
   * Check if scrolled to bottom
   */
  isAtBottom(): boolean {
    const viewportHeight = typeof this.height === 'number' ? this.height : 20;
    const maxScroll = Math.max(0, this.contentHeight - viewportHeight);
    return this.scrollPosition >= maxScroll;
  }

  /**
   * Check if scrolled to top
   */
  isAtTop(): boolean {
    return this.scrollPosition === 0;
  }

  /**
   * Reset scroll position to top
   */
  resetScroll(): void {
    this.scrollTo(0);
  }

  // ============================================================================
  // Responsive Lifecycle Hooks
  // ============================================================================

  /**
   * Handle resize - adjust scroll position if needed
   */
  protected _handleResize(width: number, height: number, state: ResponsiveState): void {
    // Call parent resize handler
    super._handleResize(width, height, state);

    // Ensure scroll position is still valid after resize
    const viewportHeight = typeof this.height === 'number' ? this.height : 20;
    const maxScroll = Math.max(0, this.contentHeight - viewportHeight);
    if (this.scrollPosition > maxScroll) {
      this.scrollTo(maxScroll);
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
    // Call parent handler
    super._handleBreakpointChange(breakpoint, previousBreakpoint, state);

    // Emit for custom handling
    this.emit('breakpoint-change', breakpoint, previousBreakpoint);
  }

  /**
   * Called when entering mobile mode - enable swipe scrolling
   */
  protected _enterMobileMode(): void {
    // Enable swipe scrolling on mobile
    if (this._swipeScrolling && !this._unsubscribeSwipe) {
      this._unsubscribeSwipe = this.enableSwipe({
        direction: 'vertical',
        onSwipe: (event) => {
          // Calculate scroll amount based on swipe distance
          const scrollAmount = event.distance * this._mobileScrollSpeed;
          if (event.direction === 'up') {
            this._initiateScroll(scrollAmount);
          } else if (event.direction === 'down') {
            this._initiateScroll(-scrollAmount);
          }
        },
      });
    }

    this.emit('enter-mobile');
  }

  /**
   * Called when exiting mobile mode - disable swipe scrolling
   */
  protected _exitMobileMode(): void {
    // Disable swipe scrolling
    if (this._unsubscribeSwipe) {
      this._unsubscribeSwipe();
      this._unsubscribeSwipe = undefined;
    }

    // Stop any momentum scrolling
    this._stopMomentum();

    this.emit('exit-mobile');
  }

  // ============================================================================
  // Momentum Scrolling
  // ============================================================================

  /**
   * Initiate scroll with optional momentum
   */
  private _initiateScroll(amount: number): void {
    if (this._momentumScrolling) {
      // Set initial velocity and start momentum
      this._scrollVelocity = amount;
      this._startMomentum();
    } else {
      // Direct scroll without momentum
      this.scroll(Math.round(amount));
    }
  }

  /**
   * Start momentum scrolling
   */
  private _startMomentum(): void {
    // Stop any existing momentum
    this._stopMomentum();

    this._momentumTimer = setInterval(() => {
      // Apply decay
      this._scrollVelocity *= SCROLL_MOMENTUM_DECAY;

      // Check if velocity is too low to continue
      if (Math.abs(this._scrollVelocity) < MIN_SCROLL_VELOCITY) {
        this._stopMomentum();
        return;
      }

      // Apply scroll
      this.scroll(Math.round(this._scrollVelocity));

      // Stop if at bounds
      if (this.isAtTop() || this.isAtBottom()) {
        this._stopMomentum();
      }
    }, 16); // ~60fps
  }

  /**
   * Stop momentum scrolling
   */
  private _stopMomentum(): void {
    if (this._momentumTimer) {
      clearInterval(this._momentumTimer);
      this._momentumTimer = undefined;
    }
    this._scrollVelocity = 0;
  }

  /**
   * Enable/disable swipe scrolling
   */
  setSwipeScrolling(enabled: boolean): void {
    this._swipeScrolling = enabled;
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
   * Enable/disable momentum scrolling
   */
  setMomentumScrolling(enabled: boolean): void {
    this._momentumScrolling = enabled;
    if (!enabled) {
      this._stopMomentum();
    }
  }

  /**
   * Override destroy to clean up
   */
  destroy(): void {
    this._stopMomentum();
    if (this._unsubscribeSwipe) {
      this._unsubscribeSwipe();
      this._unsubscribeSwipe = undefined;
    }
    super.destroy();
  }
}
