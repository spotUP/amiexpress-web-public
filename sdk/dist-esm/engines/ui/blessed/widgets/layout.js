/**
 * Layout - Container widget for arranging children in rows/columns
 *
 * Responsive features:
 * - Automatic vertical stacking on mobile (xs breakpoint)
 * - Auto-reflow on resize and breakpoint changes
 * - Configurable mobile layout mode
 * - Touch-friendly spacing on mobile
 */
import { Box } from './box';
import { isMobileWidth, MOBILE_GAP } from '../core/responsive-constants';
export class Layout extends Box {
    constructor(options = {}) {
        const { layout, renderer, mobileLayout, mobileSpacing, responsiveLayout, ...boxOptions } = options;
        super({
            ...boxOptions,
            scrollable: options.scrollable !== false,
        });
        this._desktopLayout = layout || 'inline';
        this._mobileLayout = mobileLayout || 'vertical';
        this._currentLayout = this._desktopLayout;
        this._mobileSpacing = mobileSpacing ?? MOBILE_GAP;
        this._responsiveLayout = responsiveLayout !== false; // Default: enabled
        this.renderer = renderer;
        // Trigger layout on render
        this.on('prerender', () => {
            this.performLayout();
        });
    }
    /**
     * Perform layout calculation
     */
    performLayout() {
        switch (this._currentLayout) {
            case 'inline':
                this.layoutInline();
                break;
            case 'grid':
                this.layoutGrid();
                break;
            case 'vertical':
                this.layoutVertical();
                break;
        }
        if (this.renderer) {
            const coords = this.getLayoutCoords();
            this.renderer(coords);
        }
    }
    /**
     * Inline layout - arrange children horizontally
     */
    layoutInline() {
        let currentX = 0;
        let currentY = 0;
        let maxHeight = 0;
        const containerWidth = typeof this.width === 'number' ? this.width : 100;
        for (const child of this.children) {
            const childWidth = this.getChildWidth(child);
            const childHeight = this.getChildHeight(child);
            // Wrap to next line if needed
            if (currentX > 0 && currentX + childWidth > containerWidth) {
                currentX = 0;
                currentY += maxHeight;
                maxHeight = 0;
            }
            // Position child using Element's position properties
            // Note: In blessed, positions are set via options or setters
            // For layout purposes, we just track the positions
            currentX += childWidth;
            maxHeight = Math.max(maxHeight, childHeight);
        }
    }
    /**
     * Grid layout - arrange children in a grid
     */
    layoutGrid() {
        const cols = Math.floor(Math.sqrt(this.children.length));
        const rows = Math.ceil(this.children.length / cols);
        const containerWidth = typeof this.width === 'number' ? this.width : 100;
        const containerHeight = typeof this.height === 'number' ? this.height : 30;
        const cellWidth = Math.floor(containerWidth / cols);
        const cellHeight = Math.floor(containerHeight / rows);
        // Grid layout calculation
        // Note: In blessed, child positions are typically set via options
        // This method calculates the grid but doesn't directly modify children
        let childIndex = 0;
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                if (childIndex >= this.children.length)
                    break;
                childIndex++;
            }
        }
    }
    /**
     * Vertical layout - stack children vertically (mobile-friendly)
     */
    layoutVertical() {
        let currentY = 0;
        const spacing = this.isMobile() ? this._mobileSpacing : 0;
        const containerWidth = typeof this.width === 'number' ? this.width : 100;
        for (const child of this.children) {
            const childHeight = this.getChildHeight(child);
            // Position child at current Y, full width
            // Note: We modify position directly for layout
            child.position.top = currentY;
            child.position.left = 0;
            child.position.width = containerWidth;
            currentY += childHeight + spacing;
        }
    }
    /**
     * Get child width (handle percentages and 'shrink')
     */
    getChildWidth(child) {
        const childWidth = child.width;
        const containerWidth = typeof this.width === 'number' ? this.width : 100;
        if (typeof childWidth === 'number') {
            return childWidth;
        }
        if (childWidth && typeof childWidth === 'string') {
            const widthStr = childWidth;
            if (widthStr.includes('%')) {
                const percent = parseInt(widthStr) / 100;
                return Math.floor(containerWidth * percent);
            }
            if (widthStr === 'shrink') {
                return 10; // Default shrink width
            }
        }
        return containerWidth;
    }
    /**
     * Get child height (handle percentages and 'shrink')
     */
    getChildHeight(child) {
        const childHeight = child.height;
        const containerHeight = typeof this.height === 'number' ? this.height : 30;
        if (typeof childHeight === 'number') {
            return childHeight;
        }
        if (childHeight && typeof childHeight === 'string') {
            const heightStr = childHeight;
            if (heightStr.includes('%')) {
                const percent = parseInt(heightStr) / 100;
                return Math.floor(containerHeight * percent);
            }
            if (heightStr === 'shrink') {
                return 3; // Default shrink height
            }
        }
        return containerHeight;
    }
    /**
     * Get layout coordinates for all children
     */
    getLayoutCoords() {
        return this.children.map(child => ({
            element: child,
            x: child.left,
            y: child.top,
            width: this.getChildWidth(child),
            height: this.getChildHeight(child),
        }));
    }
    /**
     * Set layout type (for desktop mode)
     */
    setLayout(layout) {
        this._desktopLayout = layout;
        if (!this.isMobile() || !this._responsiveLayout) {
            this._currentLayout = layout;
        }
        this.performLayout();
        if (this.screen) {
            this.screen.render();
        }
    }
    /**
     * Get current layout type
     */
    getLayout() {
        return this._currentLayout;
    }
    /**
     * Get desktop layout type
     */
    getDesktopLayout() {
        return this._desktopLayout;
    }
    /**
     * Set mobile layout type
     */
    setMobileLayout(layout) {
        this._mobileLayout = layout;
        if (this.isMobile() && this._responsiveLayout) {
            this._currentLayout = layout;
            this.performLayout();
            if (this.screen) {
                this.screen.render();
            }
        }
    }
    /**
     * Get mobile layout type
     */
    getMobileLayout() {
        return this._mobileLayout;
    }
    /**
     * Enable/disable responsive layout switching
     */
    setResponsiveLayout(enabled) {
        this._responsiveLayout = enabled;
        if (enabled) {
            // Apply appropriate layout based on current mode
            this._currentLayout = this.isMobile() ? this._mobileLayout : this._desktopLayout;
            this.performLayout();
            if (this.screen) {
                this.screen.render();
            }
        }
    }
    /**
     * Reflow layout (force recalculation)
     */
    reflow() {
        this.performLayout();
        if (this.screen) {
            this.screen.render();
        }
    }
    // ============================================================================
    // Responsive Lifecycle Hooks
    // ============================================================================
    /**
     * Handle resize - reflow layout
     */
    _handleResize(width, height, state) {
        // Call parent resize handler
        super._handleResize(width, height, state);
        // Reflow layout on resize
        this.performLayout();
    }
    /**
     * Handle breakpoint change - switch layout if needed
     */
    _handleBreakpointChange(breakpoint, previousBreakpoint, state) {
        // Call parent handler
        super._handleBreakpointChange(breakpoint, previousBreakpoint, state);
        // Switch layout based on breakpoint
        if (this._responsiveLayout) {
            const wasMobile = isMobileWidth(state.screenWidth) !== state.isMobile; // Previous mobile state
            if (state.isMobile) {
                this._currentLayout = this._mobileLayout;
            }
            else {
                this._currentLayout = this._desktopLayout;
            }
            this.performLayout();
        }
        // Emit for custom handling
        this.emit('breakpoint-change', breakpoint, previousBreakpoint);
    }
    /**
     * Called when entering mobile mode - switch to mobile layout
     */
    _enterMobileMode() {
        if (this._responsiveLayout) {
            this._currentLayout = this._mobileLayout;
            this.performLayout();
        }
        this.emit('enter-mobile');
    }
    /**
     * Called when exiting mobile mode - switch to desktop layout
     */
    _exitMobileMode() {
        if (this._responsiveLayout) {
            this._currentLayout = this._desktopLayout;
            this.performLayout();
        }
        this.emit('exit-mobile');
    }
}
