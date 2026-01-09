/**
 * Mobile Carousel Widget
 *
 * Swipeable carousel for mobile-sized screens.
 * Shows one panel at a time with swipe navigation, tab bar, and page indicators.
 */
import { Box } from './box';
import { Listbar } from './listbar';
/**
 * Mobile Carousel
 * Displays one panel at a time with tab bar and swipe navigation
 */
export class MobileCarousel extends Box {
    constructor(options = {}) {
        super({
            ...options,
            // Carousel fills available space by default
            top: options.top ?? 0,
            left: options.left ?? 0,
            width: options.width ?? '100%',
            height: options.height ?? '100%',
            // Enable mouse for swipe
            mouse: true,
            clickable: true,
        });
        this.panels = [];
        this.tabLabels = [];
        this.currentPage = 0;
        // Swipe tracking
        this.swipeStartX = 0;
        this.swipeStartY = 0;
        this.isSwiping = false;
        this.panels = options.panels || [];
        this.tabLabels = options.tabLabels || [];
        this.showTabBar = options.showTabBar !== false; // Default true
        this.showIndicators = options.showIndicators !== false;
        this.swipeable = options.swipeable !== false;
        this.controlKeys = options.controlKeys !== false;
        this.swipeThreshold = options.swipeThreshold ?? 5; // Lower threshold for easier swiping
        this.onPageChange = options.onPageChange;
        this.setupTabBar();
        this.setupSwipeHandling();
        this.setupKeyboardNavigation();
        // Show first page
        if (this.panels.length > 0) {
            this.showPage(0);
        }
    }
    /**
     * Setup tab bar for navigation
     */
    setupTabBar() {
        if (!this.showTabBar)
            return;
        // Create tab bar at the top
        this.tabBar = new Listbar({
            parent: this,
            top: 0,
            left: 0,
            width: '100%',
            height: 1,
            style: {
                fg: 'white',
                bg: 'blue',
                item: { fg: 'gray', bg: 'blue' },
                selected: { fg: 'white', bg: 'cyan', bold: true },
            },
            itemPadding: 1,
            itemGap: 0,
        });
        this.updateTabBar();
    }
    /**
     * Update tab bar items
     */
    updateTabBar() {
        if (!this.tabBar)
            return;
        const items = {};
        for (let i = 0; i < this.panels.length; i++) {
            const label = this.tabLabels[i] || `Page ${i + 1}`;
            items[`tab${i}`] = {
                text: label,
                callback: () => this.showPage(i),
            };
        }
        this.tabBar.setItems(items);
        // Highlight current tab
        if (this.panels.length > 0) {
            this.tabBar.selectItem(this.currentPage);
        }
    }
    /**
     * Add a panel to the carousel
     */
    addPanel(panel, label) {
        this.panels.push(panel);
        if (label) {
            this.tabLabels.push(label);
        }
        else if (this.tabLabels.length < this.panels.length) {
            this.tabLabels.push(`Page ${this.panels.length}`);
        }
        // Hide newly added panel unless it's the current one
        if (this.panels.length - 1 !== this.currentPage) {
            panel.hide();
        }
        this.updateTabBar();
        this.updateIndicators();
    }
    /**
     * Remove a panel from the carousel
     */
    removePanel(panel) {
        const index = this.panels.indexOf(panel);
        if (index >= 0) {
            this.panels.splice(index, 1);
            this.tabLabels.splice(index, 1);
            panel.detach();
            // Adjust current page if needed
            if (this.currentPage >= this.panels.length) {
                this.currentPage = Math.max(0, this.panels.length - 1);
            }
            this.updateTabBar();
            this.showPage(this.currentPage);
        }
    }
    /**
     * Show a specific page
     */
    showPage(page) {
        if (page < 0 || page >= this.panels.length)
            return;
        // Hide all panels
        for (const panel of this.panels) {
            panel.hide();
        }
        // Show the target panel
        const targetPanel = this.panels[page];
        if (targetPanel) {
            // Calculate content area (minus tab bar and indicator)
            const tabBarHeight = this.showTabBar ? 1 : 0;
            const indicatorHeight = this.showIndicators ? 1 : 0;
            const contentTop = tabBarHeight;
            const contentHeight = this.height - tabBarHeight - indicatorHeight;
            // Position panel in content area
            targetPanel.position.top = contentTop;
            targetPanel.position.left = 0;
            targetPanel.position.width = this.width;
            targetPanel.position.height = Math.max(1, contentHeight);
            // Ensure panel is attached to carousel
            if (targetPanel.parent !== this) {
                targetPanel.detach();
                this.append(targetPanel);
            }
            targetPanel.show();
            this.currentPage = page;
            // Update tab bar selection
            if (this.tabBar) {
                this.tabBar.selectItem(page);
            }
            // Trigger callback
            if (this.onPageChange) {
                this.onPageChange(page, targetPanel);
            }
            this.updateIndicators();
            if (this.screen) {
                this.screen.render();
            }
        }
    }
    /**
     * Go to next page
     */
    next() {
        if (this.currentPage < this.panels.length - 1) {
            this.showPage(this.currentPage + 1);
        }
    }
    /**
     * Go to previous page
     */
    prev() {
        if (this.currentPage > 0) {
            this.showPage(this.currentPage - 1);
        }
    }
    /**
     * Get current page index
     */
    getCurrentPage() {
        return this.currentPage;
    }
    /**
     * Get current panel
     */
    getCurrentPanel() {
        return this.panels[this.currentPage];
    }
    /**
     * Get total number of pages
     */
    getPageCount() {
        return this.panels.length;
    }
    /**
     * Setup swipe gesture handling
     */
    setupSwipeHandling() {
        if (!this.swipeable)
            return;
        // Listen for mousedown on the carousel itself
        this.on('mousedown', (data) => {
            this.swipeStartX = data.x;
            this.swipeStartY = data.y;
            this.isSwiping = true;
        });
        // Also listen for click events (touch taps)
        this.on('click', (data) => {
            // Reset swipe state on click
            this.isSwiping = false;
        });
        // Use screen-level events for swipe tracking
        this.on('attach', () => {
            if (this.screen) {
                // Handle mouseup at screen level to catch swipe end
                this.screen.on('mouseup', this.handleSwipeEnd.bind(this));
            }
        });
    }
    /**
     * Handle swipe end
     */
    handleSwipeEnd(data) {
        if (!this.isSwiping)
            return;
        if (this.hidden)
            return; // Don't process if carousel is hidden
        this.isSwiping = false;
        const deltaX = data.x - this.swipeStartX;
        const deltaY = data.y - this.swipeStartY;
        // Only trigger if horizontal swipe is dominant
        if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) >= this.swipeThreshold) {
            if (deltaX < 0) {
                // Swipe left -> next page
                this.next();
            }
            else {
                // Swipe right -> previous page
                this.prev();
            }
        }
    }
    /**
     * Setup keyboard navigation
     */
    setupKeyboardNavigation() {
        if (!this.controlKeys)
            return;
        this.on('attach', () => {
            if (this.screen) {
                this.screen.on('keypress', (_ch, key) => {
                    // Only handle if carousel is visible
                    if (this.hidden)
                        return;
                    if (key.name === 'right' || key.name === 'l') {
                        this.next();
                        return;
                    }
                    if (key.name === 'left' || key.name === 'h') {
                        this.prev();
                        return;
                    }
                });
            }
        });
    }
    /**
     * Update page indicator dots
     */
    updateIndicators() {
        if (!this.showIndicators)
            return;
        // Create indicator box if needed
        if (!this.indicatorBox) {
            this.indicatorBox = new Box({
                parent: this,
                bottom: 0,
                left: 'center',
                height: 1,
                width: this.panels.length * 2 + 1,
                tags: true,
                style: {
                    fg: 'white',
                    bg: 'black',
                },
            });
        }
        // Build indicator string: [*] [ ] for pages
        const dots = [];
        for (let i = 0; i < this.panels.length; i++) {
            if (i === this.currentPage) {
                dots.push('{cyan-fg}*{/cyan-fg}');
            }
            else {
                dots.push('{gray-fg}o{/gray-fg}');
            }
        }
        this.indicatorBox.setContent(' ' + dots.join(' ') + ' ');
        this.indicatorBox.position.width = this.panels.length * 2 + 1;
    }
    /**
     * Check if carousel or any child has focus
     * Override of Element.hasFocusedChild()
     */
    hasFocusedChild() {
        if (!this.screen)
            return false;
        const checkFocus = (element) => {
            if (this.screen?.focused === element)
                return true;
            for (const child of element.children || []) {
                if (checkFocus(child))
                    return true;
            }
            return false;
        };
        return checkFocus(this);
    }
    // ============================================================================
    // Responsive Lifecycle Hooks
    // ============================================================================
    _handleBreakpointChange(breakpoint, previousBreakpoint, state) {
        super._handleBreakpointChange(breakpoint, previousBreakpoint, state);
        // Re-layout current page to fit new dimensions
        this.showPage(this.currentPage);
        this.updateIndicators();
        this.emit('breakpoint-change', breakpoint, previousBreakpoint);
    }
}
/**
 * Factory function
 */
export function mobileCarousel(options) {
    return new MobileCarousel(options);
}
