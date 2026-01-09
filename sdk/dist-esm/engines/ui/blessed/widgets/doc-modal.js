/**
 * DocModal - Documentation/Help modal widget
 *
 * A full-screen scrollable documentation overlay with:
 * - Optional bigtext header (hidden on mobile for space)
 * - Scrollable content area with navigation keys
 * - Footer with navigation hints
 * - Proper focus trapping and keyboard handling
 * - Responsive mobile support with touch gestures
 *
 * Navigation:
 * - Up/Down/j/k: Line scroll
 * - PageUp/PageDown/Left/Right/b/Space: Page scroll
 * - Home/End/g/G: Top/bottom
 * - ESC/Q/F1: Close
 * - Swipe up/down: Scroll (mobile)
 * - Tap anywhere: Close (mobile, optional)
 */
import { Box } from './box';
import { BigText } from './bigtext';
import { ScrollableText } from './scrollabletext';
import { BREAKPOINT_XS, BREAKPOINT_SM, MIN_TOUCH_HEIGHT, } from '../core/responsive-constants';
export class DocModal extends Box {
    constructor(options = {}) {
        super({
            ...options,
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            label: options.title ? ` ${options.title} ` : options.label,
            border: options.border || { type: 'line' },
            shadow: false,
            hidden: true,
            mouse: true,
            keys: true,
            closable: true,
            trapFocus: true,
            ch: ' ',
            zIndex: options.zIndex || 9999,
            style: {
                fg: 'white',
                bg: 'blue',
                border: { fg: 'cyan' },
                transparent: true,
                ...options.style,
            },
        });
        this._header = null;
        this._isMobileMode = false;
        this._swipeStartY = 0;
        this._swipeStartTime = 0;
        this._onClose = options.onClose;
        this._closeKeys = ['escape', 'q', 'f1', ...(options.closeKeys || [])];
        this._tapToDismiss = options.tapToDismiss !== false;
        this._swipeToScroll = options.swipeToScroll !== false;
        this._hasHeader = !!options.header;
        // Footer text - desktop vs mobile
        this._desktopFooterText = options.footerText !== undefined
            ? options.footerText
            : '{bold} Scroll: Arrows/PageUp/PageDown/Left/Right | Top/Bottom: Home/End | Close: ESC/Q/F1 {/bold}';
        this._mobileFooterText = options.mobileFooterText !== undefined
            ? options.mobileFooterText
            : '{bold} Swipe to scroll | Tap to close {/bold}';
        // Calculate content area top position based on header
        this._contentTopDesktop = 0;
        // Optional bigtext header (hidden on mobile)
        if (options.header) {
            this._header = new BigText({
                parent: this,
                top: 0,
                left: 'center',
                width: 'shrink',
                height: 'shrink',
                content: options.header,
                font: 'simple',
                ch: ' ',
                style: {
                    fg: options.headerStyle?.fg || 'cyan',
                    bg: options.headerStyle?.bg || 'black',
                },
            });
            this._contentTopDesktop = 3; // BigText typically takes 3 rows with 'simple' font
        }
        // Footer with navigation hints
        this._footer = new Box({
            parent: this,
            bottom: 0,
            left: 0,
            width: '100%',
            height: 1,
            tags: true,
            style: {
                fg: options.footerStyle?.fg || 'black',
                bg: options.footerStyle?.bg || 'cyan',
            },
            content: this._desktopFooterText,
        });
        // Scrollable content area
        this._contentArea = new ScrollableText({
            parent: this,
            top: this._contentTopDesktop,
            left: 1,
            width: '100%-4',
            height: `100%-${this._contentTopDesktop + 3}`, // Account for border, footer
            tags: true,
            mouse: true,
            scrollable: true,
            alwaysScroll: true,
            focusable: true,
            ch: ' ',
            scrollbar: {
                ch: ' ',
                style: { bg: 'cyan' },
            },
            style: {
                fg: options.contentStyle?.fg || 'white',
                bg: options.contentStyle?.bg || 'black',
            },
            content: options.content || '',
        });
        this._setupKeyHandlers();
        this._setupTouchHandlers();
    }
    /**
     * Set up keyboard navigation and close handlers
     */
    _setupKeyHandlers() {
        // Close handler
        const closeModal = () => {
            this.hide();
            if (this._onClose) {
                this._onClose();
            }
            this.emit('close');
        };
        // Mouse wheel scrolling
        this._contentArea.on('wheelup', () => {
            this._contentArea.scroll(-3);
            this.screen?.render();
        });
        this._contentArea.on('wheeldown', () => {
            this._contentArea.scroll(3);
            this.screen?.render();
        });
        // Keyboard navigation on content area (which has focus)
        this._contentArea.key(['up', 'k'], () => {
            this._contentArea.scroll(-1);
            this.screen?.render();
        });
        this._contentArea.key(['down', 'j'], () => {
            this._contentArea.scroll(1);
            this.screen?.render();
        });
        // Page up/down with multiple key options
        this._contentArea.key(['pageup', 'left', 'b'], () => {
            const height = this._contentArea.height || 20;
            this._contentArea.scroll(-(height - 2));
            this.screen?.render();
        });
        this._contentArea.key(['pagedown', 'right', 'space'], () => {
            const height = this._contentArea.height || 20;
            this._contentArea.scroll(height - 2);
            this.screen?.render();
        });
        // Home/End for top/bottom
        this._contentArea.key(['home', 'g'], () => {
            this._contentArea.setScrollPerc(0);
            this.screen?.render();
        });
        this._contentArea.key(['end', 'S-g'], () => {
            this._contentArea.setScrollPerc(100);
            this.screen?.render();
        });
        // Close keys on content area (since it has focus)
        this._contentArea.key(this._closeKeys, () => {
            closeModal();
        });
        // Also handle close keys on modal itself (fallback)
        this.key(this._closeKeys, () => {
            closeModal();
        });
        // Handle close event from [X] button
        this.on('close', () => {
            closeModal();
        });
    }
    /**
     * Set up touch/swipe handlers for mobile
     */
    _setupTouchHandlers() {
        // Track mouse/touch events for swipe detection
        this._contentArea.on('mousedown', (data) => {
            if (!this._swipeToScroll)
                return;
            this._swipeStartY = data.y;
            this._swipeStartTime = Date.now();
        });
        this._contentArea.on('mouseup', (data) => {
            if (!this._swipeToScroll)
                return;
            const deltaY = data.y - this._swipeStartY;
            const deltaTime = Date.now() - this._swipeStartTime;
            // Only register as swipe if quick motion (< 500ms)
            if (deltaTime < 500 && Math.abs(deltaY) >= 2) {
                // Swipe up = scroll down, swipe down = scroll up
                const scrollAmount = deltaY > 0 ? -Math.abs(deltaY) * 2 : Math.abs(deltaY) * 2;
                this._contentArea.scroll(scrollAmount);
                this.screen?.render();
            }
        });
        // Tap-to-dismiss on the modal background (not content area)
        this.on('click', (data) => {
            if (!this._isMobileMode || !this._tapToDismiss)
                return;
            // Check if click was on modal border/background, not content
            const target = data?.el || data?.element;
            if (target === this) {
                this.hide();
                if (this._onClose) {
                    this._onClose();
                }
                this.emit('close');
            }
        });
    }
    /**
     * Show the modal
     */
    display(focusOnClose) {
        // Update dimensions to current screen size
        if (this.screen) {
            this.position.width = this.screen.width;
            this.position.height = this.screen.height;
            this.position.top = 0;
            this.position.left = 0;
            // Check if mobile and apply layout
            const screenWidth = this.screen.width;
            if (screenWidth < BREAKPOINT_SM) {
                this._setMobileLayout();
            }
            else {
                this._setDesktopLayout();
            }
        }
        // Invalidate coordinate cache
        this._invalidateCache(this);
        // Store element to focus when closed
        if (focusOnClose) {
            const originalOnClose = this._onClose;
            this._onClose = () => {
                if (originalOnClose)
                    originalOnClose();
                focusOnClose.focus?.();
            };
        }
        this.show();
        this.setFront();
        this._contentArea.focus();
        this.screen?.render();
    }
    /**
     * Invalidate coordinate cache for element and children
     */
    _invalidateCache(element) {
        element._coordsCacheValid = false;
        if (element.children) {
            for (const child of element.children) {
                this._invalidateCache(child);
            }
        }
    }
    // ============================================================================
    // Responsive Lifecycle Hooks
    // ============================================================================
    /**
     * Handle resize - adjust layout for screen size
     */
    _handleResize(width, height, state) {
        super._handleResize?.(width, height, state);
        // Update modal dimensions
        this.position.width = width;
        this.position.height = height;
        // Adjust layout based on screen width
        if (width < BREAKPOINT_SM) {
            this._setMobileLayout();
        }
        else {
            this._setDesktopLayout();
        }
        this._invalidateCache(this);
    }
    /**
     * Handle breakpoint change
     */
    _handleBreakpointChange(breakpoint, previousBreakpoint, state) {
        super._handleBreakpointChange?.(breakpoint, previousBreakpoint, state);
        if (state.isMobile || breakpoint === 'xs' || breakpoint === 'small') {
            this._setMobileLayout();
        }
        else {
            this._setDesktopLayout();
        }
        this.emit('breakpoint-change', breakpoint, previousBreakpoint);
    }
    /**
     * Called when entering mobile mode
     */
    _enterMobileMode() {
        this._setMobileLayout();
        this.emit('enter-mobile');
    }
    /**
     * Called when exiting mobile mode
     */
    _exitMobileMode() {
        this._setDesktopLayout();
        this.emit('exit-mobile');
    }
    /**
     * Set mobile-friendly layout
     */
    _setMobileLayout() {
        this._isMobileMode = true;
        // Hide bigtext header on mobile (saves 3 rows of precious screen space)
        if (this._header) {
            this._header.hide();
        }
        // Move content area to top (no header)
        this._contentArea.position.top = 0;
        this._contentArea.position.height = '100%-3';
        // Use shorter mobile footer text
        this._footer.setContent(this._mobileFooterText);
        // Increase footer height for touch targets on very small screens
        if (this.screen && this.screen.width < BREAKPOINT_XS) {
            this._footer.position.height = MIN_TOUCH_HEIGHT;
            this._contentArea.position.height = `100%-${MIN_TOUCH_HEIGHT + 2}`;
        }
        this._invalidateCache(this);
        this.screen?.render();
    }
    /**
     * Set desktop layout
     */
    _setDesktopLayout() {
        this._isMobileMode = false;
        // Show bigtext header on desktop
        if (this._header) {
            this._header.show();
        }
        // Restore content area position
        this._contentArea.position.top = this._contentTopDesktop;
        this._contentArea.position.height = `100%-${this._contentTopDesktop + 3}`;
        // Restore desktop footer
        this._footer.setContent(this._desktopFooterText);
        this._footer.position.height = 1;
        this._invalidateCache(this);
        this.screen?.render();
    }
    // ============================================================================
    // Public API
    // ============================================================================
    /**
     * Set content
     */
    setContent(content) {
        this._contentArea.setContent(content);
    }
    /**
     * Get content
     */
    getContent() {
        return this._contentArea.getContent();
    }
    /**
     * Append content
     */
    appendContent(content) {
        const current = this._contentArea.getContent();
        this._contentArea.setContent(current + content);
    }
    /**
     * Set title
     */
    setTitle(title) {
        this.setLabel(` ${title} `);
    }
    /**
     * Set header text (bigtext)
     */
    setHeader(text) {
        if (this._header) {
            this._header.setContent(text);
        }
    }
    /**
     * Set footer text (desktop)
     */
    setFooterText(text) {
        this._desktopFooterText = text;
        if (!this._isMobileMode) {
            this._footer.setContent(text);
        }
    }
    /**
     * Set mobile footer text
     */
    setMobileFooterText(text) {
        this._mobileFooterText = text;
        if (this._isMobileMode) {
            this._footer.setContent(text);
        }
    }
    /**
     * Scroll to top
     */
    scrollToTop() {
        this._contentArea.setScrollPerc(0);
    }
    /**
     * Scroll to bottom
     */
    scrollToBottom() {
        this._contentArea.setScrollPerc(100);
    }
    /**
     * Get the content area element (for advanced customization)
     */
    getContentArea() {
        return this._contentArea;
    }
    /**
     * Set close callback
     */
    onClose(callback) {
        this._onClose = callback;
    }
    /**
     * Check if in mobile mode
     */
    isMobile() {
        return this._isMobileMode;
    }
    /**
     * Enable/disable tap-to-dismiss
     */
    setTapToDismiss(enabled) {
        this._tapToDismiss = enabled;
    }
    /**
     * Enable/disable swipe scrolling
     */
    setSwipeToScroll(enabled) {
        this._swipeToScroll = enabled;
    }
}
/**
 * Factory function
 */
export function docModal(options) {
    return new DocModal(options);
}
