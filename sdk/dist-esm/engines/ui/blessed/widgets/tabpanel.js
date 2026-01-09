/**
 * TabPanel Widget
 * Manages multiple views with a horizontal tab bar
 *
 * Responsive features:
 * - Swipe navigation between tabs on mobile
 * - Touch-friendly tab bar (larger height on mobile)
 * - Carousel-style navigation with swipe gestures
 */
import { Box } from './box';
import { Button } from './button';
import { MIN_TOUCH_HEIGHT } from '../core/responsive-constants';
export class TabPanel extends Box {
    constructor(options) {
        super({
            ...options,
        });
        this.tabButtons = [];
        this.tabContents = [];
        this.activeTabIndex = 0;
        this._desktopBarHeight = options.barHeight || 1;
        this._mobileBarHeight = options.mobileBarHeight ?? MIN_TOUCH_HEIGHT;
        this.barHeight = this._desktopBarHeight;
        this.tabStyle = options.style?.tab || { fg: 'white', bg: 'black' };
        this.activeTabStyle = options.style?.activeTab || { fg: 'black', bg: 'cyan', bold: true };
        this._swipeNavigation = options.swipeNavigation !== false; // Default: enabled
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
    addTab(label, content) {
        const index = this.tabButtons.length;
        // Calculate button position
        let left = 0;
        if (index > 0) {
            const prevButton = this.tabButtons[index - 1];
            left = (prevButton.aleft - this.aleft) + prevButton.width + 1;
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
        let contentElement;
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
        }
        else {
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
    selectTab(index) {
        if (index < 0 || index >= this.tabButtons.length)
            return;
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
    getActiveTab() {
        return this.activeTabIndex;
    }
    /**
     * Get number of tabs
     */
    getTabCount() {
        return this.tabButtons.length;
    }
    get type() {
        return 'tabpanel';
    }
    /**
     * Select next tab (with wraparound)
     */
    nextTab() {
        const nextIndex = (this.activeTabIndex + 1) % this.tabButtons.length;
        this.selectTab(nextIndex);
    }
    /**
     * Select previous tab (with wraparound)
     */
    previousTab() {
        const prevIndex = (this.activeTabIndex - 1 + this.tabButtons.length) % this.tabButtons.length;
        this.selectTab(prevIndex);
    }
    // ============================================================================
    // Responsive Lifecycle Hooks
    // ============================================================================
    /**
     * Handle resize - adjust tab bar layout
     */
    _handleResize(width, height, state) {
        // Call parent resize handler
        super._handleResize(width, height, state);
        // Reposition tab buttons if needed (for narrow screens)
        this._relayoutTabButtons();
    }
    /**
     * Handle breakpoint change - adjust bar height
     */
    _handleBreakpointChange(breakpoint, previousBreakpoint, state) {
        // Call parent handler
        super._handleBreakpointChange(breakpoint, previousBreakpoint, state);
        // Update bar height based on breakpoint
        if (state.isMobile) {
            this._setBarHeight(this._mobileBarHeight);
        }
        else {
            this._setBarHeight(this._desktopBarHeight);
        }
        // Emit for custom handling
        this.emit('breakpoint-change', breakpoint, previousBreakpoint);
    }
    /**
     * Called when entering mobile mode - enable swipe navigation
     */
    _enterMobileMode() {
        // Update bar height for touch-friendly targets
        this._setBarHeight(this._mobileBarHeight);
        // Enable swipe navigation on mobile
        if (this._swipeNavigation && !this._unsubscribeSwipe) {
            this._unsubscribeSwipe = this.enableSwipe({
                direction: 'horizontal',
                onSwipe: (event) => {
                    if (event.direction === 'left') {
                        this.nextTab();
                    }
                    else if (event.direction === 'right') {
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
    _exitMobileMode() {
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
    _setBarHeight(height) {
        if (this.barHeight === height)
            return;
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
    _relayoutTabButtons() {
        const containerWidth = typeof this.width === 'number' ? this.width : 80;
        let currentX = 0;
        for (const button of this.tabButtons) {
            const buttonWidth = button.width;
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
    setSwipeNavigation(enabled) {
        this._swipeNavigation = enabled;
        if (this.isMobile()) {
            if (enabled && !this._unsubscribeSwipe) {
                this._enterMobileMode();
            }
            else if (!enabled && this._unsubscribeSwipe) {
                this._unsubscribeSwipe();
                this._unsubscribeSwipe = undefined;
            }
        }
    }
    /**
     * Override destroy to clean up
     */
    destroy() {
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
export function tabpanel(options) {
    return new TabPanel(options);
}
